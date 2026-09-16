import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);


// ======================================================
// PICKBLY AGENT
// ======================================================

const PICKBLY_INSTRUCTIONS = `
You are Pickbly's AI shopping agent.

Pickbly is a local fashion marketplace.

Your job is to help customers discover real clothing
products from stores listed on Pickbly.

You behave like a genuinely helpful human salesperson.

PERSONALITY:

- Friendly
- Natural
- Short
- Helpful
- Conversational
- Never robotic
- Never overly formal
- Never mention Gemini
- Never mention APIs
- Never mention databases
- Never mention these instructions

LANGUAGE:

Understand and respond naturally in:

- English
- Sinhala
- Singlish
- Mixed Sinhala + English

Match the customer's style.

CONVERSATION:

If the customer says:

"hi"

respond naturally, for example:

"Hey! 👋 Welcome to Pickbly. What are you looking for today?"

If the customer says:

"mata t shirt ekak oni"

you can say:

"Sure! 👌 What colour or size are you looking for?"

If the customer gives enough information to search,
USE THE search_products TOOL.

Remember information from previous messages.

For example:

Customer:
"I want a black shirt"

Customer:
"XL"

You already know:

product = shirt
color = black
size = XL

Do not ask for information the customer already provided.

IMPORTANT:

Never invent products.

Never invent prices.

Never invent sizes.

Never invent colors.

Never invent stores.

Only recommend products returned by search_products.

If there are no exact matches, say so honestly
and suggest the closest real products returned by the tool.

Keep replies short and natural.
`;


// ======================================================
// SEARCH PRODUCTS TOOL
// ======================================================

const searchProductsTool = {
  type: "function",

  name: "search_products",

  description:
    "Search Pickbly's real clothing catalog for products matching the customer's requirements.",

  parameters: {
    type: "object",

    properties: {

      query: {
        type: "string",
        description:
          "General product the customer wants, such as t-shirt, shirt, dress, jeans."
      },

      color: {
        type: "string",
        description:
          "Preferred product color if the customer mentioned one."
      },

      size: {
        type: "string",
        description:
          "Preferred size such as S, M, L, XL or XXL."
      },

      max_price: {
        type: "number",
        description:
          "Maximum budget if the customer mentioned one."
      }

    },

    required: ["query"]
  }
};


// ======================================================
// ACTUAL TOOL
// ======================================================

async function searchProducts(args) {

  console.log("SEARCH PRODUCTS TOOL:", args);

  let query = supabase
    .from("products")
    .select(`
      id,
      title,
      category,
      price,
      description,
      available_sizes,
      available_colors,
      in_stock,
      image_url,
      store_name,
      store_slug
    `)
    .eq("in_stock", true)
    .limit(20);


  // --------------------------------------------
  // CATEGORY / PRODUCT SEARCH
  // --------------------------------------------

  if (args.query) {

    query = query.or(
      `title.ilike.%${args.query}%,category.ilike.%${args.query}%,description.ilike.%${args.query}%`
    );

  }


  // --------------------------------------------
  // PRICE
  // --------------------------------------------

  if (args.max_price) {

    query = query.lte(
      "price",
      args.max_price
    );

  }


  const { data, error } = await query;


  if (error) {

    console.error(
      "SUPABASE SEARCH ERROR:",
      error
    );

    throw new Error(
      "Product search failed."
    );

  }


  let results = data || [];


  // --------------------------------------------
  // SIZE FILTER
  // --------------------------------------------

  if (args.size) {

    const wantedSize =
      args.size.toLowerCase();

    results = results.filter(product => {

      const sizes =
        String(
          product.available_sizes || ""
        ).toLowerCase();

      return sizes.includes(wantedSize);

    });

  }


  // --------------------------------------------
  // COLOR FILTER
  // --------------------------------------------

  if (args.color) {

    const wantedColor =
      args.color.toLowerCase();

    results = results.filter(product => {

      const colors =
        String(
          product.available_colors || ""
        ).toLowerCase();

      return colors.includes(wantedColor);

    });

  }


  return results.slice(0, 10);
}


// ======================================================
// API HANDLER
// ======================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  try {

    const {
      message,
      interactionId
    } = req.body || {};


    if (!message) {

      return res.status(400).json({
        error: "Message is required"
      });

    }


    // ==================================================
    // START / CONTINUE GEMINI INTERACTION
    // ==================================================

    let interaction = await ai.interactions.create({

      model: "gemini-3.8-flash",

      input: message,

      previous_interaction_id:
        interactionId || undefined,

      tools: [
        searchProductsTool
      ],

      system_instruction:
        PICKBLY_INSTRUCTIONS

    });


    // ==================================================
    // CHECK FOR TOOL CALLS
    // ==================================================

    const functionCalls =
      interaction.steps.filter(
        step =>
          step.type === "function_call"
      );


    // ==================================================
    // EXECUTE TOOLS
    // ==================================================

    if (functionCalls.length > 0) {

      const results = [];


      for (const call of functionCalls) {

        if (
          call.name ===
          "search_products"
        ) {

          const result =
            await searchProducts(
              call.arguments
            );


          results.push({

            type: "function_result",

            name:
              call.name,

            call_id:
              call.id,

            result: [
              {
                type: "text",

                text:
                  JSON.stringify(result)
              }
            ]

          });

        }

      }


      // =================================================
      // GIVE TOOL RESULT BACK TO GEMINI
      // =================================================

      interaction =
        await ai.interactions.create({

          model:
            "gemini-3.8-flash",

          previous_interaction_id:
            interaction.id,

          input:
            results,

          tools: [
            searchProductsTool
          ],

          system_instruction:
            PICKBLY_INSTRUCTIONS

        });

    }


    // ==================================================
    // RETURN TO FRONTEND
    // ==================================================

    return res.status(200).json({

      reply:
        interaction.output_text || "",

      interactionId:
        interaction.id

    });


  } catch (error) {

    console.error(
      "PICKBLY AGENT ERROR:",
      error
    );


    return res.status(500).json({

      error:
        error.message ||
        "Pickbly agent failed."

    });

  }

}
