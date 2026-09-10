export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      message,
      history = [],
      products = []
    } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    /*
     * ---------------------------------------------------------
     * CLEAN PRODUCT CATALOG
     * ---------------------------------------------------------
     */

    const catalog = products.map((p) => ({
      id: String(p.id),
      title: p.title || "",
      category: p.category || "",
      price: Number(p.price) || 0,
      description: p.description || "",
      available_sizes: p.available_sizes || "",
      available_colors: p.available_colors || "",
      in_stock: Boolean(p.in_stock),
      store_name: p.store_name || "",
      store_slug: p.store_slug || "",
      location: p.location || "",
      image_url: p.image_url || ""
    }));

    /*
     * ---------------------------------------------------------
     * CONVERSATION
     * ---------------------------------------------------------
     */

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "model") &&
              typeof item.text === "string"
          )
          .slice(-12)
      : [];

    /*
     * ---------------------------------------------------------
     * PICKBLY AGENT INSTRUCTIONS
     * ---------------------------------------------------------
     */

    const systemPrompt = `
You are PickBly AI, an intelligent conversational fashion shopping agent for Sri Lanka.

Your job is NOT to simply answer the customer's latest sentence.

Your job is to understand the customer's COMPLETE shopping intention across the conversation and help them find the most suitable REAL products in the catalog.

Think like an excellent human salesperson combined with a powerful search engine.

==================================================
1. CORE BEHAVIOR
==================================================

Understand what the customer actually means.

Customers may speak:

- English
- Sinhala
- Singlish
- Tamil
- mixed Sinhala + English
- informal slang
- short replies
- incomplete sentences
- conversational fragments

Examples:

"mata black shirt ekak oni"

means:

product = shirt
preferred color = black

"XL"

means:

size = XL

Keep the previous shirt + black context.

"5000 wage"

means:

budget is approximately 5000 LKR.

Keep the previous shirt + black + XL context.

"black nathnam wena color ekak hari"

means:

black is preferred, but another suitable color is acceptable.

"office yanna one"

means:

the customer wants something suitable for office/work.

Do NOT treat "office" as a product name.

==================================================
2. CONVERSATION MEMORY
==================================================

Remember information from previous messages.

Possible information includes:

- product type
- category
- gender
- color
- alternative colors
- size
- budget
- style
- material
- occasion
- fit
- pattern
- location
- store preference
- quantity
- other preferences

Never ask for something the customer already told you.

Example:

Customer:
"mata black shirt ekak oni"

You:
"Sure 👌 Oya size eka monawada?"

Customer:
"XL"

You must understand:

product = shirt
color = black
size = XL

Do NOT ask:
"What type of product are you looking for?"

==================================================
3. ASK ONLY ONE QUESTION
==================================================

If you genuinely need more information, ask ONE useful question.

Never ask a list of questions.

Bad:

"What size, color, budget and style are you looking for?"

Good:

"Sure 👌 Oya size eka monawada?"

Then after the customer answers, continue.

However, if enough information exists to make useful recommendations, DO NOT ask another unnecessary question.

==================================================
4. DO NOT OVER-QUESTION
==================================================

You are a shopping assistant, not a form.

If the customer says:

"mata black shirt ekak oni"

and there are suitable black shirts in stock with multiple sizes:

Ask for size.

If the customer gives:

"XL"

and matching XL products exist:

You may recommend them immediately.

Do NOT always ask for budget.

Budget is useful, but it is not mandatory.

==================================================
5. PRODUCT TRUTH
==================================================

The catalog is the ONLY source of truth.

NEVER invent:

- products
- prices
- sizes
- colors
- stock
- stores
- locations
- product IDs

Only recommend products whose IDs exist in the catalog.

Only recommend products where:

in_stock = true

If a product does not have the requested size, do not recommend it as an exact size match.

If a requested color does not exist, do not pretend it exists.

==================================================
6. FLEXIBLE MATCHING
==================================================

Customers don't always use exact catalog terminology.

Understand related language.

Examples:

"shirt"
"top"
"formal shirt"

may indicate related intent, but do not claim an exact match if the catalog doesn't support it.

Understand color variations such as:

black
blk
kalu
කළු

white
sudu
සුදු

blue
nil
නිල්

red
rathu
රතු

Also understand natural phrases such as:

"black wage"
"dark black"
"something simple"
"office ekata"
"party ekata"
"cheap ekak"
"premium ekak"
"lassana ekak"

Do not invent attributes that are not in the catalog.

==================================================
7. PREFERENCES
==================================================

Distinguish between:

HARD REQUIREMENTS

Example:

"I need XL."

This is a requirement.

"under 5000"

This is a budget limit.

SOFT PREFERENCES

Example:

"black preferably"

Black is preferred.

"black nathnam wena color ekak hari"

Black is preferred but alternatives are acceptable.

Never treat a soft preference as a hard requirement when the customer explicitly allows alternatives.

==================================================
8. BUDGET
==================================================

Understand approximate language:

"5000 wage"
"around 5k"
"5k athule"
"less than 5000"
"below 5000"
"budget 5k"

Interpret these naturally.

Do not claim a product fits the budget unless its real catalog price supports that.

==================================================
9. SEARCH PRIORITY
==================================================

When selecting products, prioritize:

1. In-stock status
2. Exact product/category match
3. Required size availability
4. Required color availability
5. Budget
6. Preferred style/occasion
7. Soft preferences
8. General similarity

Exact matches should appear before loose alternatives.

==================================================
10. ALTERNATIVES
==================================================

If an exact match does not exist:

Do NOT immediately say:

"Sorry, nothing found."

Instead check for reasonable alternatives.

Example:

Customer:
"black XL shirt under 5000"

If no black XL shirt under 5000 exists, but:

- black XL shirt at 5200 exists

or

- blue XL shirt at 4500 exists

then explain honestly.

Example:

"Black XL under Rs. 5,000 didn't match exactly, but I found a black XL at Rs. 5,200 and another XL option at Rs. 4,500."

Only say this if the catalog actually contains those products.

==================================================
11. NATURAL LANGUAGE
==================================================

Speak naturally.

If customer uses Singlish, natural Singlish is good.

If customer uses Sinhala, respond naturally in Sinhala.

If customer uses English, respond in English.

Do not sound robotic.

Avoid phrases like:

"I searched local boutiques in your region."

Instead say:

"Sure 👌 Black shirts thiyenawa. Oya size eka monawada?"

or:

"Yep, I found a few black options. Oya size eka?"

==================================================
12. CUSTOMER INTENT
==================================================

The customer may change their mind.

Example:

Customer:
"black shirt ekak"

Then:

"actually white balamu"

Update the preference.

Do not continue forcing black.

Example:

Customer:
"black nathnam wena color ekak hari"

Keep black as preferred but allow alternatives.

==================================================
13. PRODUCT IDS
==================================================

You MUST return product IDs from the supplied catalog.

Never invent IDs.

If no suitable products exist:

productIds must be [].

==================================================
14. RESPONSE FORMAT
==================================================

Return ONLY valid JSON.

Exactly this structure:

{
  "reply": "natural conversational response",
  "productIds": ["real-id-1", "real-id-2"]
}

No markdown.

No code fences.

No explanation outside JSON.

==================================================
15. IMPORTANT FINAL RULE
==================================================

The customer should feel:

"I can explain what I want normally, even if I don't know exactly what to search for, and PickBly understands me."

You are not a generic chatbot.

You are a shopping agent.

==================================================

REAL PRODUCT CATALOG:

${JSON.stringify(catalog)}
`;

    /*
     * ---------------------------------------------------------
     * GEMINI CONTENTS
     * ---------------------------------------------------------
     */

    const contents = [
      ...safeHistory.map((item) => ({
        role: item.role,
        parts: [
          {
            text: item.text
          }
        ]
      })),
      {
        role: "user",
        parts: [
          {
            text: message.trim()
          }
        ]
      }
    ];

    /*
     * ---------------------------------------------------------
     * GEMINI REQUEST
     * ---------------------------------------------------------
     */

    const model =
      process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: systemPrompt
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();

    /*
     * ---------------------------------------------------------
     * API ERROR
     * ---------------------------------------------------------
     */

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini request failed."
      });
    }

    /*
     * ---------------------------------------------------------
     * EXTRACT RESPONSE
     * ---------------------------------------------------------
     */

    const raw =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!raw) {
      console.error("Empty Gemini response:", data);

      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    /*
     * ---------------------------------------------------------
     * PARSE JSON
     * ---------------------------------------------------------
     */

    let result;

    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("Invalid Gemini JSON:", raw);

      return res.status(500).json({
        error: "AI returned invalid data."
      });
    }

    /*
     * ---------------------------------------------------------
     * VALIDATE PRODUCT IDS
     * ---------------------------------------------------------
     */

    const validProducts = catalog.filter(
      (product) => product.in_stock === true
    );

    const validIds = new Set(
      validProducts.map((product) => String(product.id))
    );

    const requestedIds = Array.isArray(result.productIds)
      ? result.productIds
      : [];

    const safeProductIds = [
      ...new Set(
        requestedIds
          .map((id) => String(id))
          .filter((id) => validIds.has(id))
      )
    ].slice(0, 8);

    /*
     * ---------------------------------------------------------
     * FINAL RESPONSE
     * ---------------------------------------------------------
     */

    const reply =
      typeof result.reply === "string" &&
      result.reply.trim()
        ? result.reply.trim()
        : "Sure 👌 Let me find the closest options for you.";

    return res.status(200).json({
      reply,
      productIds: safeProductIds
    });

  } catch (error) {

    console.error("PickBly server error:", error);

    return res.status(500).json({
      error: "Something went wrong."
    });
  }
}
