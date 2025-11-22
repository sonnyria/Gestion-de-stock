import { GoogleGenAI, Type } from "@google/genai";
import { ProductEnhancement } from '../types.ts';

// Helper to get the client with the user's key
const getAIClient = (): GoogleGenAI => {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    throw new Error("Clé API manquante. Veuillez la configurer dans les paramètres.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Uses Gemini Vision to attempt to read a barcode from an image.
 */
export const readBarcodeWithGemini = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    
    // Remove header if present (data:image/jpeg;base64,)
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: "Analyze this image to find a product barcode (UPC, EAN, ISBN). 1. Look for the black bars. 2. If the bars are blurry, READ THE NUMBERS printed below the bars. Return ONLY the sequence of digits/characters found. Remove any spaces. If nothing is found, return 'NOT_FOUND'."
          }
        ]
      },
      config: {
        temperature: 0.1, // Low temperature for precision
      }
    });

    const text = response.text?.trim();
    if (!text || text === 'NOT_FOUND') {
      return null;
    }

    // Clean up the response (remove "Barcode:", spaces, etc.)
    // Find the longest sequence of digits (at least 8 digits to avoid random numbers)
    const match = text.replace(/\s/g, '').match(/[0-9A-Za-z]{8,}/);
    
    if (match && match[0]) {
      return match[0];
    }
    
    // Fallback: if the response is just digits but short (rare for products)
    if (/^\d+$/.test(text)) {
        return text;
    }
    
    return null;

  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    // Rethrow if it's a configuration error so the UI can show it
    if (error.message.includes("Clé API") || error.message.includes("API key")) {
        throw error;
    }
    return null;
  }
};

/**
 * Enhances product data by suggesting a category and emoji based on the name.
 */
export const enhanceProductInfo = async (productName: string): Promise<ProductEnhancement> => {
  try {
    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Categorize the product named "${productName}" and provide a suitable emoji.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, description: "A short general category (e.g., 'Alimentation', 'Électronique', 'Maison')" },
            emoji: { type: Type.STRING, description: "A single emoji representing the product" },
            suggestedName: { type: Type.STRING, description: "A corrected or formatted version of the product name if the input was messy, otherwise the same name" }
          },
          required: ["category", "emoji"],
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from Gemini");

    const data = JSON.parse(jsonText) as ProductEnhancement;
    return data;

  } catch (error) {
    console.error("Gemini Enhancement Error:", error);
    return {
      category: "Divers",
      emoji: "📦",
      suggestedName: productName
    };
  }
};