document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and forms
            tabBtns.forEach(b => b.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));

            // Add active class to clicked button and corresponding form
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}Form`).classList.add('active');
        });
    });

    // ตรวจสอบว่ามี token อยู่แล้วหรือไม่
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/rooms';
        return;
    }

    // การ Register
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value;
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;

        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });

            if (response.ok) {
                // หลังจาก register สำเร็จ ให้ login อัตโนมัติ
                const loginResponse = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (loginResponse.ok) {
                    const data = await loginResponse.json();
                    localStorage.setItem('token', data.access_token);
                    localStorage.setItem('username', data.user.username);
                    window.location.href = '/rooms';
                }
            } else {
                const error = await response.json();
                alert(error.message || 'Registration failed');
            }
        } catch (error) {
            alert('Registration failed');
        }
    });

    // การ Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('username', data.user.username);
                window.location.href = '/rooms';
            } else {
                const error = await response.json();
                alert(error.message || 'Login failed');
            }
        } catch (error) {
            alert('Login failed');
        }
    });
}); 