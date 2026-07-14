const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini on the server side to keep API_KEY secure
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const modelId = "gemini-2.5-flash";

// Generic Advice Endpoint
router.post('/advice', async (req, res) => {
  try {
    const { query, contextData } = req.body;

    const systemPrompt = `
      You are an expert agricultural consultant specializing in cattle fattening, veterinary science, and farm economics.
      Your goal is to maximize weight gain efficiency (ADG), minimize feed costs, and ensure animal welfare.
      
      Context Data Provided:
      ${JSON.stringify(contextData || {}, null, 2)}
      
      Please answer the user's question based on this data if applicable. 
      Keep answers concise, actionable, and professional.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nUser Question: " + query }] }
      ]
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// Growth Prediction Endpoint
router.post('/predict-growth', async (req, res) => {
    try {
        const { cattle, feedPackage } = req.body;
        
        const prompt = `
            Act as a livestock growth analyst. Predict the future growth trajectory for this specific animal.

            Animal Details:
            - Breed: ${cattle.breed}
            - Gender: ${cattle.gender}
            - Current Weight: ${cattle.currentWeight} kg
            - Target Daily Gain (User Goal): ${cattle.dailyTargetGain} kg/day
            - Age/Teeth: ${cattle.teeth} teeth

            Diet Plan:
            ${feedPackage 
                ? `- Package Name: ${feedPackage.name}\n- Intake Target: ${feedPackage.dailyIntakePercent}% of Body Weight\n- Composition: ${JSON.stringify(feedPackage.items)}`
                : "- No specific package assigned (Assume standard maintenance diet)"}

            Task:
            1. **Assessment**: Is the user's Target Daily Gain realistic given the breed and diet?
            2. **Forecast**: Predict the weight for the next 30, 60, and 90 days.
            3. **Recommendation**: Provide one specific tip to ensure this animal hits its target.

            Format the response clearly using Markdown.
        `;

        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
        });

        res.json({ text: response.text });
    } catch (error) {
        console.error('AI Prediction Error:', error);
        res.status(500).json({ error: 'Prediction failed' });
    }
});

module.exports = router;