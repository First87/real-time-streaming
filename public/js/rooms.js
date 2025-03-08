// เพิ่ม SweetAlert2 library
const sweetAlertScript = document.createElement('script');
sweetAlertScript.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
document.head.appendChild(sweetAlertScript);

// เพิ่ม Font Awesome ถ้ายังไม่มี
const fontAwesomeScript = document.createElement('link');
fontAwesomeScript.rel = 'stylesheet';
fontAwesomeScript.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
document.head.appendChild(fontAwesomeScript);

document.addEventListener('DOMContentLoaded', () => {
    // ตั้งค่า theme เริ่มต้น
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // จัดการการสลับ theme
    document.getElementById('themeToggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        const themeIcon = document.querySelector('#themeToggle i');
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // แสดงชื่อผู้ใช้
    const username = localStorage.getItem('username');
    document.getElementById('username').textContent = username;

    // เพิ่มข้อมูลการเชื่อมต่อจาก localStorage ถ้ามี
    const socketAuth = {
        token: token
    };

    // ถ้ามีข้อมูลห้องที่กำลังเชื่อมต่ออยู่
    const currentRoom = localStorage.getItem('currentRoom');
    const roomPassword = localStorage.getItem('roomPassword');
    if (currentRoom) {
        socketAuth.reconnect = {
            roomId: currentRoom,
            password: roomPassword
        };
    }

    const socket = io({
        auth: socketAuth,
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    // Logout handler
    document.getElementById('logoutBtn').onclick = () => {
        localStorage.clear();
        window.location.href = '/login.html';
    };

    // Create Room handler
    document.getElementById('createRoomBtn').addEventListener('click', async () => {
        const roomNameInput = document.getElementById('newRoomName');
        const roomPasswordInput = document.getElementById('roomPassword');
        const roomName = roomNameInput.value.trim();
        const roomPassword = roomPasswordInput.value.trim();
        const createRoomBtn = document.getElementById('createRoomBtn');

        if (roomName) {
            try {
                createRoomBtn.disabled = true;
                createRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

                const isAIRoom = roomName.toLowerCase().includes('ai') || 
                               roomName.toLowerCase().includes('bot') || 
                               roomName.toLowerCase().includes('assistant');
                
                socket.emit('createRoom', { 
                    name: roomName,
                    isAIRoom: isAIRoom,
                    password: roomPassword || null // ส่ง null ถ้าไม่มีรหัสผ่าน
                });

                roomNameInput.value = '';
                roomPasswordInput.value = '';

            } catch (error) {
                console.error('Error creating room:', error);
                alert('Failed to create room. Please try again.');
            } finally {
                createRoomBtn.disabled = false;
                createRoomBtn.innerHTML = '<i class="fas fa-plus"></i> Create Room';
            }
        }
    });

    // Listen for room creation response
    socket.on('roomCreated', (room) => {
        const createRoomBtn = document.getElementById('createRoomBtn');
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = '<i class="fas fa-plus"></i> Create Room';
        addRoomToList(room);
    });

    // Listen for rooms list update
    socket.on('roomsList', (rooms) => {
        const roomsList = document.getElementById('roomsList');
        roomsList.innerHTML = '';
        rooms.forEach(room => addRoomToList(room));
    });

    // Request initial rooms list
    socket.emit('getRooms');

    // Error handling
    socket.on('createRoomError', (error) => {
        const createRoomSection = document.querySelector('.create-room');
        createRoomSection.classList.remove('creating-room');
        alert(error.message || 'Failed to create room');
    });

    function addRoomToList(room) {
        const roomsList = document.getElementById('roomsList');
        const roomElement = document.createElement('div');
        
        const isAIRoom = room.isAIRoom || 
                        room.name.toLowerCase().includes('ai') || 
                        room.name.toLowerCase().includes('bot') ||
                        room.name.toLowerCase().includes('assistant');

        roomElement.className = `room-card ${isAIRoom ? 'ai-room' : ''}`;
        
        roomElement.innerHTML = `
            <div class="room-content">
                <div class="room-header">
                    <div class="room-name">
                        <i class="${isAIRoom ? 'fas fa-robot' : 'fas fa-comments'}"></i>
                        ${room.name}
                        ${isAIRoom ? '<span class="ai-badge">AI Powered</span>' : ''}
                        ${room.hasPassword ? '<i class="fas fa-lock" title="Password protected"></i>' : ''}
                    </div>
                    <div class="room-status ${room.userCount > 0 ? 'active' : ''}">
                        <span class="status-dot"></span>
                        ${room.userCount > 0 ? 'Active' : 'Empty'}
                    </div>
                </div>
                <div class="room-info">
                    <div class="user-count">
                        <i class="fas fa-users"></i>
                        <span>${room.userCount || 0} users online</span>
                    </div>
                    <button class="join-room-btn">
                        ${isAIRoom ? '<i class="fas fa-robot"></i> Chat with AI' : '<i class="fas fa-sign-in-alt"></i> Join Room'}
                    </button>
                </div>
                ${isAIRoom ? `
                <div class="ai-features">
                    <div class="ai-feature-item">
                        <i class="fas fa-brain"></i>
                        <span>Auto Response</span>
                    </div>
                    <div class="ai-feature-item">
                        <i class="fas fa-bolt"></i>
                        <span>Instant Reply</span>
                    </div>
                    <div class="ai-feature-item">
                        <i class="fas fa-comment-dots"></i>
                        <span>Thai Support</span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        roomElement.onclick = async () => {
            if (room.hasPassword) {
                await showPasswordPrompt(room.id, room.name, isAIRoom);
            } else {
                joinRoom(room.id, null, room.name, isAIRoom);
            }
        };

        roomsList.appendChild(roomElement);
    }

    async function showPasswordPrompt(roomId, roomName, isAIRoom) {
        // รอให้ SweetAlert2 โหลดเสร็จ
        if (typeof Swal === 'undefined') {
            await new Promise(resolve => {
                const checkSwal = setInterval(() => {
                    if (typeof Swal !== 'undefined') {
                        clearInterval(checkSwal);
                        resolve();
                    }
                }, 100);
            });
        }

        Swal.fire({
            title: 'กรุณาใส่รหัสผ่าน',
            html: `
                <div class="password-input-container">
                    <input type="password" 
                           id="room-password" 
                           class="swal2-input" 
                           placeholder="รหัสผ่าน"
                           autocomplete="off">
                    <div class="password-toggle">
                        <i class="fas fa-eye" id="togglePassword"></i>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'เข้าร่วม',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4CAF50',
            cancelButtonColor: '#f44336',
            showLoaderOnConfirm: true,
            allowOutsideClick: false,
            allowEscapeKey: true,
            didOpen: () => {
                // Add password toggle functionality
                const togglePassword = document.getElementById('togglePassword');
                const passwordInput = document.getElementById('room-password');
                
                togglePassword.addEventListener('click', function () {
                    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordInput.setAttribute('type', type);
                    this.classList.toggle('fa-eye');
                    this.classList.toggle('fa-eye-slash');
                });

                // Add enter key support
                passwordInput.addEventListener('keyup', function(event) {
                    if (event.key === 'Enter') {
                        Swal.clickConfirm();
                    }
                });

                // Auto focus password input
                passwordInput.focus();
            },
            preConfirm: () => {
                const password = document.getElementById('room-password').value;
                if (!password) {
                    Swal.showValidationMessage('กรุณาใส่รหัสผ่าน');
                    return false;
                }
                return password;
            }
        }).then((result) => {
            if (result.isConfirmed) {
                joinRoom(roomId, result.value, roomName, isAIRoom);
            }
        });
    }

    function joinRoom(roomId, password, roomName, isAIRoom) {
        // เก็บรหัสผ่านไว้ใน localStorage
        if (password) {
            localStorage.setItem('roomPassword', password);
        }
        localStorage.setItem('currentRoom', roomId);
        localStorage.setItem('currentRoomName', roomName);
        localStorage.setItem('isAIRoom', isAIRoom);
        
        if (isAIRoom) {
            localStorage.setItem('aiConfig', JSON.stringify({
                type: 'rule-based',
                responses: {
                    greeting: ['สวัสดีครับ', 'ยินดีต้อนรับครับ'],
                    help: ['ต้องการให้ช่วยอะไรครับ?', 'มีอะไรให้ช่วยไหมครับ?'],
                    thanks: ['ด้วยความยินดีครับ', 'ยินดีให้บริการครับ']
                }
            }));
        }
        
        // ส่ง event เพื่อตรวจสอบรหัสผ่านก่อน
        socket.emit('joinRoom', { 
            roomId: roomId, 
            password: password 
        });

        // รอฟังผลการเข้าห้อง
        socket.once('joinRoomResult', (result) => {
            if (result.success) {
                // เข้าห้องสำเร็จ
                window.location.href = '/chat';
            } else {
                // ถ้าเข้าห้องไม่สำเร็จ ลบข้อมูลที่เก็บไว้
                localStorage.removeItem('roomPassword');
                localStorage.removeItem('currentRoom');
                localStorage.removeItem('currentRoomName');
                localStorage.removeItem('isAIRoom');
                localStorage.removeItem('aiConfig');
                
                // แสดงข้อความแจ้งเตือนด้วย SweetAlert2
                Swal.fire({
                    icon: 'error',
                    title: 'เข้าห้องไม่สำเร็จ',
                    text: result.message || 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่',
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#f44336'
                });
            }
        });
    }

    // Add this CSS to your existing styles
    const style = document.createElement('style');
    style.textContent = `
        .password-input-container {
            position: relative;
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
        }

        .password-input-container input {
            padding-right: 40px !important;
            border: 2px solid #ddd !important;
            border-radius: 8px !important;
            height: 45px !important;
            font-size: 16px !important;
            width: 100% !important;
            transition: border-color 0.3s ease !important;
        }

        .password-input-container input:focus {
            border-color: #4CAF50 !important;
            box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2) !important;
        }

        .password-toggle {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            padding: 5px;
        }

        .password-toggle i {
            color: #666;
            transition: color 0.3s ease;
        }

        .password-toggle:hover i {
            color: #4CAF50;
        }

        .swal2-popup {
            border-radius: 15px !important;
        }

        .swal2-title {
            font-size: 24px !important;
            color: #333 !important;
            margin-bottom: 20px !important;
        }

        .swal2-confirm {
            border-radius: 8px !important;
            padding: 12px 24px !important;
            font-size: 16px !important;
        }

        .swal2-cancel {
            border-radius: 8px !important;
            padding: 12px 24px !important;
            font-size: 16px !important;
        }

        .swal2-validation-message {
            background-color: #fff3cd !important;
            color: #856404 !important;
            border-radius: 8px !important;
            padding: 10px !important;
            margin-top: 10px !important;
        }
    `;
    document.head.appendChild(style);
}); 