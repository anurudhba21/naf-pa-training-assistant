import os
import logging
from pypdf import PdfReader
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="NAF PA Training Chatbot API", description="Serverless Backend for NAF PA Training Notes")

# CORS middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PDF Path resolution (works locally and in Vercel serverless environment)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(BASE_DIR, "CD PA Training Notes 1.pdf")

pdf_content_cache = ""
pdf_metadata = {
    "filename": "CD PA Training Notes 1.pdf",
    "pages": 0,
    "characters": 0,
    "status": "Not loaded"
}

def load_pdf_content():
    global pdf_content_cache, pdf_metadata
    if not os.path.exists(PDF_PATH):
        logger.error(f"PDF file not found at {PDF_PATH}")
        pdf_metadata["status"] = "Error: File not found"
        return

    try:
        logger.info(f"Loading PDF from {PDF_PATH}...")
        reader = PdfReader(PDF_PATH)
        pages_text = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                pages_text.append(f"--- PAGE {idx + 1} ---\n{text}\n")
            else:
                pages_text.append(f"--- PAGE {idx + 1} ---\n[No extractable text on this page]\n")
        
        pdf_content_cache = "\n".join(pages_text)
        pdf_metadata["pages"] = len(reader.pages)
        pdf_metadata["characters"] = len(pdf_content_cache)
        pdf_metadata["status"] = "Loaded successfully"
        logger.info(f"Successfully loaded PDF: {pdf_metadata['pages']} pages, {pdf_metadata['characters']} characters.")
    except Exception as e:
        logger.exception("Failed to load PDF content")
        pdf_metadata["status"] = f"Error: {str(e)}"

# Load PDF once at module import/startup
load_pdf_content()

# System Instruction Builder
def get_system_instruction():
    return f"""
You are an expert, friendly, and highly professional AI assistant representing the New American Funding (NAF) Production Assistant (PA) training department.
Your sole purpose is to answer user questions about the NAF CD PA Training Notes provided in the context.

CRITICAL INSTRUCTIONS:
1. You MUST ONLY answer questions using the facts, procedures, guidelines, names, and information explicitly stated in the NAF PA Training Notes below.
2. If the user's question is completely unrelated to mortgage processing, loan structures (FHA, VA, Conventional, NAF 2nd, etc.), disclosures, title, escrow, or PA milestones/procedures mentioned in the notes, you MUST politely decline to answer. Reply exactly with a professional message indicating that you can only answer questions related to the NAF PA Training Notes.
3. If the user asks about a mortgage term or process (e.g. "What is HELOC?"), first explain it using the exact text from the training notes. You can provide minor context if absolutely needed for clarity, but do not contradict or add details not supported by the document.
4. For every answer, you MUST cite the specific Page Number(s) from the training notes where the information was found. The notes contain pages demarcated as "--- PAGE X ---" (e.g., "[Page 3]"). Place references clearly at the end of relevant points or paragraphs, like: "(Page 3)".
5. Format your response beautifully. Use clear paragraphs, lists, bold keywords, or tables where appropriate, making it easy to read.

Here are the NAF CD PA Training Notes:
=========================================
{pdf_content_cache}
=========================================
"""

# Pydantic schemas
class ChatMessage(BaseModel):
    role: str # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

@app.get("/api/info")
def get_info():
    """Returns metadata about the loaded training notes PDF and backend key configuration."""
    info = pdf_metadata.copy()
    info["has_env_key"] = bool(os.getenv("GEMINI_API_KEY"))
    return info

@app.post("/api/chat")
def chat(request: ChatRequest):
    """Processes chat messages using Gemini API with PDF context."""
    # Retrieve key from environment variable
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API Key is missing on the server. Please set the GEMINI_API_KEY environment variable."
        )

    if not pdf_content_cache:
        # Retry loading once in case it failed at boot due to cold start path resolution
        load_pdf_content()
        if not pdf_content_cache:
            raise HTTPException(
                status_code=500,
                detail="The training notes PDF could not be loaded. Please check Vercel logs."
            )

    try:
        # Construct google-genai Client
        client = genai.Client(api_key=api_key)
        
        # Prepare content list for chat
        contents = []
        for msg in request.history:
            role = "user" if msg.role == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )
            
        # Append the new user message
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=request.message)]
            )
        )

        system_instruction = get_system_instruction()

        # Call Gemini model
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,
            )
        )
        
        return {"response": response.text}
    except Exception as e:
        logger.error(f"Gemini API Error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error communicating with Gemini: {str(e)}"
        )

# Serve static files for local runs (Vercel ignores this and serves via edge CDN)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Use absolute path for public directory to prevent path resolution issues
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

@app.get("/")
def read_index():
    public_index = os.path.join(PUBLIC_DIR, "index.html")
    if os.path.exists(public_index):
        return FileResponse(public_index)
    return {"message": "NAF PA Chatbot Backend is running."}

if os.path.exists(PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")
