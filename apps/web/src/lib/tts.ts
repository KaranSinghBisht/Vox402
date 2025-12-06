// TTS with Murf AI as primary (ElevenLabs disabled)

export async function playElevenLabsTTS(text: string, apiKey: string): Promise<HTMLAudioElement | null> {
    if (!text) return null;

    // 1. Try Murf AI first (faster, working)
    const murfKey = process.env.NEXT_PUBLIC_MURF_API_KEY;
    if (murfKey) {
        const result = await tryMurfAI(text, murfKey);
        if (result) return result;
    }

    // 2. ElevenLabs disabled - API key blocked
    // if (apiKey) {
    //     const result = await tryElevenLabs(text, apiKey);
    //     if (result) return result;
    // }

    // 3. Fall back to browser TTS
    return playBrowserTTS(text);
}

// ElevenLabs TTS
async function tryElevenLabs(text: string, apiKey: string): Promise<HTMLAudioElement | null> {
    try {
        const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice
        console.log("[TTS] Trying ElevenLabs...");

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_flash_v2_5",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            }),
        });

        if (!response.ok) {
            console.error("[TTS] ElevenLabs failed:", response.status);
            return null;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        console.log("[TTS] ElevenLabs playing");
        return audio;
    } catch (error) {
        console.error("[TTS] ElevenLabs error:", error);
        return null;
    }
}

// Murf AI TTS
async function tryMurfAI(text: string, apiKey: string): Promise<HTMLAudioElement | null> {
    try {
        console.log("[TTS] Trying Murf AI...");

        const response = await fetch('https://api.murf.ai/v1/speech/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
            },
            body: JSON.stringify({
                voiceId: "en-US-natalie", // Professional female voice
                text: text,
                format: "MP3",
                sampleRate: 24000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[TTS] Murf AI failed:", response.status, errorText);
            return null;
        }

        const data = await response.json();

        // Murf returns audioFile URL in response
        if (data.audioFile) {
            const audio = new Audio(data.audioFile);
            audio.play();
            console.log("[TTS] Murf AI playing");
            return audio;
        }

        return null;
    } catch (error) {
        console.error("[TTS] Murf AI error:", error);
        return null;
    }
}

// Browser's built-in TTS as final fallback
function playBrowserTTS(text: string): null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        console.warn("[TTS] Browser TTS not available");
        return null;
    }

    console.log("[TTS] Using browser fallback voice");
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
        /samantha|victoria|zira|female|woman|karen|moira|fiona/i.test(v.name)
    ) || voices.find(v => v.lang.startsWith("en"));

    if (preferredVoice) {
        u.voice = preferredVoice;
        console.log("[TTS] Using voice:", preferredVoice.name);
    }

    u.rate = 1.0;
    u.pitch = 1.1;

    window.speechSynthesis.speak(u);
    return null;
}
