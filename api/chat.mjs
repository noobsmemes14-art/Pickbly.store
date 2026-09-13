export default async function handler(req, res) {
  // 1. HTTP Method Validation
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 2. API Key Guard
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in environment variables.");
      return res.status(500).json({ error: "API key is not configured." });
    }

    // 3. Request Extraction & Normalization
    const body = req.body || {};
    const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const products = Array.isArray(body.products) ? body.products : [];

    if (!rawMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    const lowerMessage = rawMessage.toLowerCase();

    // 4. Ultra-Fast Hybrid Conversational Pre-Filter (Singlish + English)
    const quickReplies = [
      {
        patterns: [/^(hi|hello|hey|hiya|hii+|(good\s*(morning|afternoon|evening))|halo|helo)$/i, /^kohomada/i, /^machan/i],
        reply: "Hey! 👋 Welcome to Pickbly. Looking for clothing or fashion items today?"
      },
      {
        patterns: [/^(thanks|thank\s*you|thx|sthuthi|bohoma\s*sthuthi)$/i],
        reply: "You're welcome! 😊 Let me know if you need anything else."
      },
      {
        patterns: [/^(bye|goodbye|gdn8|gn)$/i],
        reply: "Take care! 👋 Visit Pickbly anytime."
      }
    ];

    for (const item of quickReplies) {
      if (item.patterns.some((regex) => regex.test(lowerMessage))) {
        return res.status(200).json({ reply: item.reply });
      }
    }

    // 5. Optimized Catalog Compression (Saves 60%+ LLM Tokens)
    const inStockCatalog = products
      .filter((p) => p.in_stock === true || p.in_stock === undefined)
      .map((p) => ({
        id: p.id || null,
        title: p.title || "",
        category: p.category || "",
        price: p.price || "",
        colors: Array.isArray(p.available_colors) ? p.available_colors.join(", ") : p.available_colors || "",
        sizes: Array.isArray(p.available_sizes) ? p.available_sizes.join(", ") : p.available_sizes || "",
        store: p.store_name || "",
        desc: p.description ? p.description.slice(0, 100) : ""
      }));

    // 6. Advanced System Prompt Architecture
    const systemPrompt = `
You are Pickbly AI, an expert e-commerce shopping assistant for Pickbly (a Sri Lankan fashion marketplace).

CORE DUTIES:
- Assist shoppers in finding clothing and fashion items from local vendors.
- Provide natural, human-like sales assistance without sounding robotic.

LANGUAGE & TONE TRADITIONS:
- Multi-lingual capability: Fully understand English, Sinhala, and Singlish (e.g., "mata t-shirt ekak oni", "black size L thiyenawada?").
- Adapt to the buyer's language style automatically.
- Keep standard responses brief (1-3 sentences).

CONTEXT MEMORY & ACCURACY RULES:
- Never re-ask for information already mentioned in the conversation history (e.g., if user said "black size L", remember both).
- ALWAYS recommend products strictly from the CATALOG below.
- NEVER invent fake products, prices, stock statuses, or store names.
- If no exact match exists, state it transparently and suggest the closest available item in the catalog.

CATALOG REAL-TIME DATA:
${JSON.stringify(inStockCatalog)}
`;

    // 7. Sanitized Conversation History Engine (Truncated to last 10 messages max)
    const formattedContents = [];
    const maxHistoryWindow = history.slice(-10);

    for (const item of maxHistoryWindow) {
      if (!item || !item.content) continue;
      const contentText = String(item.content).trim();
      if (!contentText) continue;

      formattedContents.push({
        role: item.role === "assistant" || item.role === "model" ? "model" : "user",
        parts: [{ text: contentText }]
      });
    }

    // Append current user message
    formattedContents.push({
      role: "user",
      parts: [{ text: rawMessage }]
    });

    // 8. Call Gemini API
    const model = "gemini-2.5-flash";
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(geminiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: formattedContents,
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 600
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", response.status, JSON.stringify(data));
      return res.status(500).json({
        error: data?.error?.message || "Failed to communicate with AI agent."
      });
    }

    const aiReply = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!aiReply) {
      return res.status(500).json({ error: "Agent returned an empty response." });
    }

    // 9. Deliver Response
    return res.status(200).json({ reply: aiReply });

  } catch (error) {
    console.error("Pickbly Agent Exception:", error);
    return res.status(500).json({
      error: error?.message || "Internal marketplace agent error."
    });
  }
}
