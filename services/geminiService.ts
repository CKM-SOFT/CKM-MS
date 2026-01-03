
import { GoogleGenAI } from "@google/genai";

export const askGemini = async (prompt: string, history: { role: 'user' | 'model', parts: { text: string }[] }[] = []) => {
  const ai = new GoogleGenAI({ apiKey: AIzaSyB0hy6wRPXDF2eaSmaYYQIdvQemfW2mWHA });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: "You are a professional, neutral, and restrained AI assistant on Telegram. Provide concise, helpful, and objective information. Use a calm tone and avoid slang, excessive emojis, or youthful enthusiasm. Format your answers clearly.",
        temperature: 0.3, // Lower temperature for more restrained responses
        topP: 0.9,
        topK: 40,
      },
    });

    return response.text || "I am unable to process that request at this time.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Status: Connection to Gemini services interrupted.";
  }
};
