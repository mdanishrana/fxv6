import { GoogleGenAI } from "@google/genai";
import { Cattle, FeedItem, FeedPackage } from "../types";

// Lazy initialization to prevent top-level execution errors if env is undefined
let ai: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!ai) {
    // Use Vite environment variable
    const apiKey = import.meta.env.VITE_API_KEY;

    console.log("Gemini Service Init - Key Available:", !!apiKey); // Debug log

    if (!apiKey) {
      console.warn("FarmsXpert: VITE_API_KEY is missing. AI features will be disabled.");
    }
    ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key-placeholder' });
  }
  return ai;
};

const modelId = "gemini-2.5-flash";

export const getFarmingAdvice = async (
  query: string,
  contextData: { cattle?: Cattle[]; feed?: FeedItem[] }
): Promise<string> => {
  try {
    const client = getAiClient();

    // Minify context data to save tokens
    const minimizedContext = {
      summary: `Total Cattle: ${contextData.cattle?.length || 0}, Total Feed Items: ${contextData.feed?.length || 0}`,
      cattleSample: contextData.cattle?.slice(0, 5).map(c => ({
        tag: c.tagNumber,
        wt: c.currentWeight,
        breed: c.breed,
        st: c.status
      })) || [], // Only send top 5 as sample context
      feed: contextData.feed?.map(f => ({
        n: f.name,
        q: f.quantityKg,
        p: f.proteinPercent
      })) || []
    };

    const systemPrompt = `
      You are an expert agricultural consultant.
      Context: ${JSON.stringify(minimizedContext)}
      
      Answer concise and professional.
    `;

    const response = await client.models.generateContent({
      model: modelId,
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nQuestion: " + query }] }
      ]
    });

    return response.text || "No advice could be generated at this time.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `Connection Failed: ${error.message || error.toString()}`;
  }
};

export const analyzeGrowthTrends = async (cattle: Cattle[]): Promise<string> => {
  try {
    const client = getAiClient();

    // Prepare a summarized version of data to save tokens
    const summaryData = cattle.map(c => ({
      tag: c.tagNumber,
      breed: c.breed,
      entryWt: c.entryWeight,
      currWt: c.currentWeight,
      daysOnFarm: Math.floor((new Date().getTime() - new Date(c.entryDate).getTime()) / (1000 * 3600 * 24)),
      status: c.status
    }));

    const prompt = `
      Analyze the following cattle performance data. 
      Identify the top 3 performing animals (highest estimated daily gain) and bottom 3.
      Suggest if any specific breed is underperforming based on this small sample.
      Data: ${JSON.stringify(summaryData)}
    `;

    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Analysis failed.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Unable to perform growth analysis.";
  }
};

export const calculateRation = async (feeds: FeedItem[], targetGain: string, avgWeight: string): Promise<string> => {
  try {
    const client = getAiClient();

    const prompt = `
      Act as an expert ruminant nutritionist. I need a TMR (Total Mixed Ration) formulation.
      
      Parameters:
      - Average Animal Weight: ${avgWeight} kg
      - Target Daily Weight Gain: ${targetGain}
      
      Available Feed Ingredients (Inventory & Nutrition):
      ${JSON.stringify(feeds, null, 2)}
      
      Task:
      Calculate a balanced daily ration (in kg per head) that meets the Net Energy (NEg) and Crude Protein (CP) requirements for this weight and gain target.
      Ensure the total Dry Matter Intake (DMI) is realistic (typically 2-3% of body weight).
      Prioritize using available ingredients to optimize cost.
      
      Output Requirements:
      1. Nutritional Requirements Summary (Target DMI, CP %, ME/NE).
      2. Recommended Formulation Table (Ingredient | Kg/Head | % of Ration | Est. Cost).
      3. Total estimated cost per head per day.
      4. Brief explanation and specific recommendation for mineral/vitamin premixes if needed.
    `;

    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Ration calculation failed.";
  } catch (error) {
    console.error("Gemini Ration Error:", error);
    return "Unable to calculate ration.";
  }
};

export const predictMixPerformance = async (
  mixItems: { name: string; amount: number; protein: number; energy: number }[],
  animalDetails: { weight: string; breed: string }
): Promise<string> => {
  try {
    const client = getAiClient();

    const prompt = `
      Act as a cattle nutritionist expert. I have created a custom feed mix (Wanda/TMR) and want to know the expected performance.

      The Mix Recipe:
      ${JSON.stringify(mixItems, null, 2)}
      (Amounts are in kg or ratio units)

      Target Animal:
      - Weight: ${animalDetails.weight} kg
      - Breed: ${animalDetails.breed}

      Analysis Required:
      1. **Nutritional Profile**: Calculate the estimated CP% (Crude Protein) and ME (Metabolizable Energy Mcal/kg) of this total mix on a Dry Matter basis.
      2. **Expected Daily Gain (ADG)**: Based on the energy density and protein, predict the Daily Weight Gain (in KG/day). Be realistic.
      3. **Critique**: Is this mix balanced? Is it lacking fiber (acidosis risk) or protein?
      4. **Suggestion**: One slight modification to improve the gain.
    `;

    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Prediction failed.";
  } catch (error) {
    console.error("Gemini Prediction Error:", error);
    return "Unable to analyze feed mix.";
  }
};

export const predictWeightGrowth = async (
  cattle: Cattle,
  feedPackage: FeedPackage | undefined
): Promise<string> => {
  try {
    const client = getAiClient();

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

    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Growth prediction unavailable.";

  } catch (error) {
    console.error("Gemini Growth Prediction Error:", error);
    return "Unable to predict growth trends at this moment.";
  }
};