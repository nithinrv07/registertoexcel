import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();

  // Parse JSON and URL encoded payloads with high limits to allow high-res images
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // API Route for AI OCR Extraction using Gemini 3.5 Flash
  app.post("/api/extract", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image payload in body." });
      }

      // Check for GEMINI_API_KEY env var
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not defined. Please add your key in Settings > Secrets." 
        });
      }

      // Strip content type header prefix from base64 if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const imagePart = {
        inlineData: {
          mimeType: "image/png",
          data: base64Data,
        }
      };

      const systemInstruction = `You are a professional educational register digitizer. 
Your task is to extract rows of student records from the provided school register page.

Follow these rules closely:
1. Translate, transcribe, and clean all student metadata. The output must be in clean, high-contrast English block capitals.
2. Strict Negative Constraint: Do NOT include any Tamil language script/characters (such as 'தமிழ்', name in tamil, or any phonetic non-English text). Translate or strictly skip any Tamil visual content, capturing ONLY the corresponding English fields.
3. Column Schema mapping:
  - sNo: Serial Number. Examples in image: 13, 14, 15, 16, 17, 18, 19, 20...
  - admNo: Admission Number. Examples in image: 4713, 4711, 4714...
  - name: Student name. Examples in image: "MOHAMMED SAFWAAN .R", "MUKILESHWAR .M", "PAVIN .V", "SAISIBU .P".
  - dob: Date of Birth. Examples in image: "24.02.2022", "24.7.2021", "29.09.2021"...
  - religion: Religion. Examples in image: "MUSLIM", "HINDU"...
  - caste: Caste. Examples in image: "BC", "DNC", "MBC", "SC", "ST"...
  - emisNo: EMIS Number. (Found under raw label EMIS NO e.g. "2031552056", "2031550370"...)
  - bloodGroup: Blood Group (e.g. "O +ve", "B -ve", "B +ve", "A +ve", etc.)
  - height: Height (e.g. "97 cm", "115 cm")
  - weight: Weight (e.g. "12 kg", "16 kg")
  - annualIncome: Annual Income (e.g. "96,000", "1,00,000", "1,08,000")
  - fatherName: Husband/Father name extracted from parent/guardian info (e.g. "M. RABEEKRAJA" or "B. MURALI RAJAN")
  - fatherOccupation: Occupation of the father (e.g. "BUSSINESS", "ARMY", "FARMER", "DRIVER")
  - motherName: Wife/Mother name extracted from parent/guardian info (e.g. "R. SHARMILA BANNUH" or "E. MEENACHI")
  - motherOccupation: Occupation of the mother (e.g. "HOMEMAKER", "TEACHER", "DMLT HOMEMAKER")
  - address: Complete postal/residential address found in the same row/box (e.g. "398A, ZEON NAGAR, 2ND ST, MNM, SVG." or "54D, KALLAR ST, MNM, SIVAGANGAI.")
  - cellNo: Cellphone Number. Mobile phone from the record (e.g. "9047070967", "981122004317")
  - aadharNo: Aadhar Number (e.g. "378724647415"...)
  - identMark: Identification Mark (e.g. "SCAR NEAR THE LEFT EYE", "SCAR NEAR LEFT EAR")
4. Strive for ultra-high accuracy and double-check each line sequence. Use '-' if a particular cell/item is completely empty. We must populate all standard rows visible on the page.`;

      // Define standard models to try. We prioritize gemini-3.5-flash, then try gemini-2.5-flash, and fall back to gemini-3.1-flash-lite.
      const modelsToTry = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
      let response = null;
      let lastError: any = null;

      for (const modelToUse of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`AI OCR: Attempting with model ${modelToUse}, attempt ${attempt}`);
            response = await ai.models.generateContent({
              model: modelToUse,
              contents: [
                imagePart,
                "Please digitize the students in this school admission register into the requested JSON array."
              ],
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sNo: { type: Type.STRING },
                      admNo: { type: Type.STRING },
                      name: { type: Type.STRING },
                      dob: { type: Type.STRING },
                      religion: { type: Type.STRING },
                      caste: { type: Type.STRING },
                      emisNo: { type: Type.STRING },
                      bloodGroup: { type: Type.STRING },
                      height: { type: Type.STRING },
                      weight: { type: Type.STRING },
                      annualIncome: { type: Type.STRING },
                      fatherName: { type: Type.STRING },
                      fatherOccupation: { type: Type.STRING },
                      motherName: { type: Type.STRING },
                      motherOccupation: { type: Type.STRING },
                      address: { type: Type.STRING },
                      cellNo: { type: Type.STRING },
                      aadharNo: { type: Type.STRING },
                      identMark: { type: Type.STRING },
                    },
                    required: ["sNo", "admNo", "name", "dob"],
                  },
                },
              },
            });

            if (response && response.text) {
              break;
            }
          } catch (err: any) {
            lastError = err;
            console.warn(`Model ${modelToUse} failed on attempt ${attempt}:`, err?.message || err);
            // Wait slightly before retry or next model
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
        if (response && response.text) {
          break;
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error("Failed to extract data from image with all available models.");
      }

      const extractedText = response.text;
      if (!extractedText) {
        throw new Error("Empty response returned from the Gemini AI model.");
      }

      const records = JSON.parse(extractedText.trim());
      res.json({ records, rawText: extractedText });

    } catch (error: any) {
      console.error("AI Extraction Error:", error);
      res.status(500).json({ error: error?.message || "An error occurred during AI OCR Extraction." });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fullstack Server running on http://localhost:${PORT}`);
  });
}

startServer();
