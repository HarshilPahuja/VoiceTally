const fs = require('fs');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

// Use native fetch and FormData (Node 22+)
const { Blob } = require('buffer');

const AUDIO_FILE = 'test_audio.wav';

// 1. Generate test audio using ffmpeg-static
console.log("Generating test audio with ffmpeg at:", ffmpegPath);

// Arguments for ffmpeg: -y (overwrite), -f lavfi (input format), -i sine=... (input), output file
const args = ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3', AUDIO_FILE];

execFile(ffmpegPath, args, async (error, stdout, stderr) => {
    if (error) {
        console.error("Error creating audio:", error);
        return;
    }
    console.log("Audio created. Sending request...");

    // 2. Send request
    try {
        const fileBuffer = fs.readFileSync(AUDIO_FILE);
        const fileName = 'test_audio.wav';

        const blob = new Blob([fileBuffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('audio', blob, fileName);

        console.log("Fetching http://localhost:3000/transcribe...");
        const response = await fetch('http://localhost:3000/transcribe', {
            method: 'POST',
            body: formData
        });

        console.log("Response Status:", response.status);
        if (response.ok) {
            const result = await response.json();
            console.log("Response Body:", result);
        } else {
            const text = await response.text();
            console.log("Response Error Body:", text);
        }

    } catch (fetchError) {
        console.error("Fetch error:", fetchError);
    } finally {
        // Cleanup
        if (fs.existsSync(AUDIO_FILE)) fs.unlinkSync(AUDIO_FILE);
    }
});
