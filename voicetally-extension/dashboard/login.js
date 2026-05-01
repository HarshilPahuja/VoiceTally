document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');
    const submitBtn = document.getElementById('submitBtn');

    errorMsg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    console.log(`[Dashboard Login] Attempting login for ${email}`);

    try {
        const res = await fetch('http://127.0.0.1:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const response = await res.json();

        if (response.success) {
            console.log(`[Dashboard Login] Success. Role: ${response.role}`);
            sessionStorage.setItem('vt_token', response.token);
            sessionStorage.setItem('vt_role', response.role);

            if (response.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'index.html';
            }
        } else {
            console.warn(`[Dashboard Login] Failed: ${response.error}`);
            errorMsg.textContent = response.error || 'Authentication Failed';
        }
    } catch (err) {
        console.error(`[Dashboard Login] Backend error:`, err);
        errorMsg.textContent = 'Backend unreachable. Is the server running?';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
    }
});
