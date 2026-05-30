document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect to dashboard
    if (localStorage.getItem('sk_auth_token')) {
        window.location.href = 'index.html';
        return;
    }

    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('login-submit-btn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) return;

        // Reset state
        errorMsg.classList.remove('show');
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = 'Verifying...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success && data.token) {
                // Success: Save token and redirect
                localStorage.setItem('sk_auth_token', data.token);
                
                submitBtn.innerText = 'Access Granted';
                submitBtn.style.background = 'var(--neon-green)';
                
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 500);
            } else {
                // Error: Show message
                errorMsg.innerText = data.error || 'Authentication failed';
                errorMsg.classList.add('show');
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Login Error:', error);
            errorMsg.innerText = 'Unable to connect to authentication server';
            errorMsg.classList.add('show');
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
        }
    });
});
