document.getElementById('enableBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.textContent = "Requesting access...";

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Got permission! Stop the stream immediately, we just needed the grant.
        stream.getTracks().forEach(track => track.stop());

        status.textContent = "Success! Microphone access granted.";
        status.className = "success";
        document.getElementById('enableBtn').style.display = 'none';

        setTimeout(() => {
            window.close(); // Optional: close the tab after success
        }, 2000);

    } catch (err) {
        console.error(err);
        status.textContent = "Error: Permission denied. Please allow microphone access.";
        status.className = "error";
    }
});
