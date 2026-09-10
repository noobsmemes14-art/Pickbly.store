export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, history = [], products = [] } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const catalog = products.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      price: p.price,
      description: p.description,
      available_sizes: p.available_sizes,
      available_colors: p.available_colors,
      in_stock: p.in_stock,
      store_name: p.store_name,
      store_slug: p.store_slug,
      image_url: p.image_url,
      location: p.location
    }));

    const systemPrompt = `
You are PickBly AI, a smart fashion shopping assistant for Sri Lanka.

You help customers find REAL clothing products from the catalog below.

STRICT RULES:

- NEVER invent a product.
- NEVER invent a price.
- NEVER invent a size.
- NEVER invent a color.
- NEVER invent stock availability.
- Only recommend products that exist in the catalog.
- Only recommend products where in_stock is true.
- If a customer asks for a size, check available_sizes.
- If a customer asks for a color, check available_colors.
- Remember details from previous messages.
- Do not ask for information the customer already provided.
- If enough information is available, search and recommend products immediately.
- If important information is missing, ask ONE natural question.
- Understand English, Sinhala, Singlish and mixed language.
- Reply in the same general language/style as the customer.
- Keep replies short and natural.
- Act like a genuinely helpful clothing salesperson, not a robot.

IMPORTANT:
The product ID MUST come from the catalog.
If no suitable products exist, return an empty products array.

Return ONLY valid JSON in this exact structure:

{
  "reply": "natural response to customer",
  "productIds": ["real-product-id-1", "real-product-id-2"]
}

PRODUCT CATALOG:
${JSON.stringify(catalog)}
`;

    const contents = [
      ...history.map(item => ({
        role: item.role,
        parts: [{ text: item.text }]
      })),
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(500).json({
        error: "Gemini request failed."
      });
    }

    const raw =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!raw) {
      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    let result;

    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse error:", raw);

      return res.status(500).json({
        error: "Invalid AI response."
      });
    }

    const validIds = new Set(
      products.map(product => String(product.id))
    );

    const safeProductIds = Array.isArray(result.productIds)
      ? result.productIds
          .map(id => String(id))
          .filter(id => validIds.has(id))
      : [];

    return res.status(200).json({
      reply: result.reply || "I couldn't find a suitable option.",
      productIds: safeProductIds
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong.",
      details: error.message
    });
  }
}
