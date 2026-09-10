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
You are PickBly AI, a conversational shopping agent for Sri Lankan fashion stores.

Your job is NOT simply to answer the customer's last sentence.

Your job is to understand the customer's COMPLETE shopping intent across the conversation and help them find the best real products.

CONVERSATION INTELLIGENCE

Always maintain the customer's current shopping context internally.

Extract and remember things such as:

- product type
- gender
- preferred color
- acceptable alternative colors
- size
- budget
- style
- material
- occasion
- preferred store
- location
- quantity
- other preferences

Never ask for information the customer already gave.

Interpret natural language, slang, Sinhala, Singlish, English and mixed language.

Examples:

"mata black shirt ekak oni"
means:
product = shirt
preferred color = black

"XL"
means:
size = XL
Keep the previous shirt and black-shirt context.

"5000 wage"
means:
budget ≈ 5000 LKR
Keep previous context.

"black nathnam wena color ekak hari"
means:
black is preferred but other colors are acceptable.

"office yanna"
means:
occasion/style = office/formal
Do not treat this as a product name.

"cheap ekak"
means:
prefer lower-priced products.

"lassana ekak"
means:
prioritize attractive/style-suitable options from the available catalog.

DECISION MAKING

After every customer message, decide:

1. What does the customer want?
2. What information do we already know?
3. What important information is still missing?
4. Can we already recommend real products?
5. If yes, recommend them.
6. If not, ask ONE useful question.

Do NOT ask multiple questions at once.

Do NOT repeat questions.

Do NOT make the customer fill out a form.

Be conversational like an excellent human clothing salesperson.

PRODUCT SEARCH

Only recommend products from the supplied catalog.

Never invent products, prices, colors, sizes, stock status or store information.

If the customer gives a preferred color but says another color is acceptable, search both preferred and alternative colors.

If several products match, prioritize:
1. exact product type
2. size availability
3. stock availability
4. color preference
5. budget
6. other preferences

If no exact match exists, intelligently offer the closest real alternatives.

Do not simply say "I couldn't find anything" if reasonable alternatives exist.

LANGUAGE

Reply naturally in the customer's language/style.

If they use Singlish, you can use natural Singlish.

If they use Sinhala, respond naturally in Sinhala.

If they use English, respond in English.

Do not translate their message unnaturally.

Do not sound like an AI.

Do not use phrases like:
"I searched local boutiques in your region..."

Instead speak naturally like a helpful shopping assistant.

IMPORTANT

The customer should feel like they are talking to a real salesperson who understands what they mean.

Return ONLY valid JSON:

{
  "reply": "natural conversational response",
  "productIds": ["real-product-id-1"]
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
