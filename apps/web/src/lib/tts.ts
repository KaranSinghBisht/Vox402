export async function playElevenLabsTTS(text: string, apiKey: string) {
    if (!text || !apiKey) return;

    try {
        // Voice ID: "Rachel" (American, Professional, Calm) - 21m00Tcm4TlvDq8ikWAM
        // Alternatives: "Domi" (Dom) - AZnzlk1XvdvUeBnXmlld
        const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_flash_v2_5", // Optimized for speed, available on free tier
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("ElevenLabs API Error:", response.status, errorText);
            throw new Error(`ElevenLabs API failed: ${response.status} ${errorText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        // Return audio element so we can control it (stop/pause)
        audio.play();
        return audio;

    } catch (error) {
        console.error("TTS Error:", error);
        // Fallback to browser TTS if ElevenLabs fails (e.g. quota exceeded)
        const u = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(u);
        return null;
    }
}
