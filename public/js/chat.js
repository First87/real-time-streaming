document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const currentRoom = localStorage.getItem('currentRoom');
    const currentRoomName = localStorage.getItem('currentRoomName');
    const username = localStorage.getItem('username');
    
    if (!token || !currentRoom) {
        window.location.href = '/rooms';
        return;
    }

    // Socket connection with fallback options
    const socket = io({
        auth: {
            token: token
        },
        transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        forceNew: true
    });

    // Connection error handling
    socket.on('connect_error', (error) => {
        console.log('Connection error:', error.message);
        
        if (error.message.includes('jwt expired')) {
            handleTokenExpiration();
        } else {
            // Try to reconnect with polling if WebSocket fails
            if (socket.io.opts.transports[0] === 'websocket') {
                console.log('WebSocket failed, falling back to polling');
                socket.io.opts.transports = ['polling'];
                socket.connect();
            }
        }
    });

    // Handle token expiration
    async function handleTokenExpiration() {
        try {
            const response = await fetch('/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: localStorage.getItem('token')
                })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('token', data.token);
                
                // Reconnect with new token
                socket.auth.token = data.token;
                socket.connect();
            } else {
                window.location.href = '/login';
            }
        } catch (err) {
            console.error('Error refreshing token:', err);
            window.location.href = '/login';
        }
    }

    // Connection status indicators
    socket.on('connect', () => {
        console.log('Connected to server');
        document.body.classList.remove('disconnected');
        // เมื่อเชื่อมต่อสำเร็จ ส่งคำขอเข้าห้อง
        socket.emit('joinRoom', { roomId: currentRoom });
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        document.body.classList.add('disconnected');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
        socket.emit('joinRoom', {
            roomId: currentRoom,
            reconnect: true
        });
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Reconnection attempt:', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
        console.log('Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
        console.log('Failed to reconnect');
        alert('Connection failed. Please refresh the page.');
    });

    // แสดงชื่อห้องในส่วนหัว
    document.getElementById('roomName').textContent = currentRoomName;

    // ตัวแปรสำหรับเก็บข้อมูล
    let selectedFile = null;
    let replyingTo = null;
    let editingMessage = null;
    const emojis = [
        '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
        '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
        '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
        '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒',
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
        '👍', '👎', '👏', '🙌', '🤝', '🤗', '🤔', '🤭'
    ];

    // Event Listeners
    document.getElementById('fileUpload').addEventListener('change', handleFileUpload);
    document.getElementById('sendButton').onclick = sendMessage;
    document.getElementById('messageInput').onkeypress = handleEnterPress;
    document.getElementById('cancelFile').onclick = handleCancelFile;
    document.getElementById('cancelReply').onclick = handleCancelReply;
    document.getElementById('leaveRoomBtn').onclick = handleLeaveRoom;

    // Typing indicator
    let typingTimeout;
    const typingIndicator = document.getElementById('typingIndicator');
    
    document.getElementById('messageInput').oninput = () => {
        clearTimeout(typingTimeout);
        socket.emit('typing', { roomId: currentRoom });
        
        typingTimeout = setTimeout(() => {
            socket.emit('stopTyping', { roomId: currentRoom });
        }, 1000);
    };

    // แสดง typing indicator
    socket.on('typing', ({ username: typingUsername }) => {
        if (typingUsername !== username) {
            if (!typingIndicator) return;
            
            typingIndicator.textContent = `${typingUsername} is typing...`;
            typingIndicator.style.display = 'block';
            
            // Clear any existing timeout
            if (typingIndicator.timeout) {
                clearTimeout(typingIndicator.timeout);
            }
            
            // Set new timeout
            typingIndicator.timeout = setTimeout(() => {
                if (typingIndicator.style.display === 'block') {
                    typingIndicator.style.display = 'none';
                }
            }, 1000);
        }
    });

    // Handle stopTyping event
    socket.on('stopTyping', ({ username: typingUsername }) => {
        if (typingUsername !== username && typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    });

    // Initialize emoji picker
    initEmojiPicker();

    // Socket event listeners
    socket.on('message', handleNewMessage);
    socket.on('chatHistory', handleChatHistory);
    socket.on('notification', handleNotification);
    socket.on('messageReadUpdate', handleMessageReadUpdate);

    // เพิ่ม event listeners สำหรับจัดการ users
    socket.on('roomUsers', (data) => {
        console.log('Received room users:', data);
        if (data && Array.isArray(data.users)) {
            updateUsersList(data.users);
        }
    });

    socket.on('userJoined', (data) => {
        console.log('User joined:', data);
        handleNotification({ message: `${data.username} has joined the room` });
        if (data.users) {
            updateUsersList(data.users);
        }
    });

    socket.on('userLeft', (data) => {
        console.log('User left:', data);
        handleNotification({ message: `${data.username} has left the room` });
        if (data.users) {
            updateUsersList(data.users);
        }
    });

    // Update private message handling
    socket.on('privateMessage', (data) => {
        console.log('Received private message:', data);
        const { from, to, message } = data;
        
        // Skip if message is already displayed
        if (data.displayed) return;
        
        // Determine the other user (for chat window)
        const otherUser = from === username ? to : from;
        
        // Create or get chat window
        let chatWindow = document.querySelector(`.private-chat-modal[data-user="${otherUser}"]`);
        
        // If chat window doesn't exist, create it
        if (!chatWindow) {
            chatWindow = document.createElement('div');
            chatWindow.className = 'private-chat-modal';
            chatWindow.setAttribute('data-user', otherUser);
            chatWindow.style.display = 'flex';  // Make sure it's visible
            chatWindow.innerHTML = `
                <div class="private-chat-container">
                    <div class="private-chat-header">
                        <div class="private-chat-user">
                            <i class="fas fa-user-circle"></i>
                            <span>${otherUser}</span>
                        </div>
                        <button class="close-btn">&times;</button>
                    </div>
                    <div class="private-chat-messages"></div>
                    <div class="private-chat-input">
                        <input type="text" placeholder="Type a message..." />
                        <button class="send-btn">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(chatWindow);
            
            // Add event listeners for new chat window
            const input = chatWindow.querySelector('input');
            const sendBtn = chatWindow.querySelector('.send-btn');
            
            sendBtn.onclick = () => {
                const messageText = input.value.trim();
                if (messageText) {
                    socket.emit('privateMessage', {
                        to: otherUser,
                        message: messageText,
                        displayed: true  // Mark as displayed when sending
                    });
                    input.value = '';
                }
            };
            
            input.onkeypress = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendBtn.click();
                }
            };
            
            chatWindow.querySelector('.close-btn').onclick = () => {
                chatWindow.style.display = 'none';
            };
        } else {
            chatWindow.style.display = 'flex';  // Make sure it's visible
        }
        
        // Add message to chat
        const messagesContainer = chatWindow.querySelector('.private-chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `private-message ${from === username ? 'sent' : 'received'}`;
        messageElement.innerHTML = `
            <div class="message-content">${message}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Mark message as displayed
        data.displayed = true;
    });

    // Update function to send private message
    function sendPrivateMessage(to, message) {
        if (!message.trim()) return;
        
        socket.emit('privateMessage', {
            to: to,
            message: message,
            displayed: true
        });
    }

    // Update user click handler
    function updateUsersList(users) {
        const usersList = document.querySelector('.users-list');
        usersList.innerHTML = '';
        
        users.forEach(user => {
            if (user.username === username) return;
            
            const userElement = document.createElement('div');
            userElement.className = 'user-item clickable';
            userElement.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="user-details">
                        <div class="user-name">${user.username}</div>
                        <div class="user-status ${user.active ? 'online' : 'offline'}">
                            <span class="status-dot"></span>
                            ${user.active ? 'Online' : 'Offline'}
                        </div>
                    </div>
                </div>
            `;
            
            userElement.onclick = () => {
                startPrivateChat(user.username);
            };
            
            usersList.appendChild(userElement);
        });
    }

    // Functions
    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                alert('File size too large. Maximum size is 10MB.');
                return;
            }
            selectedFile = file;
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('filePreview').style.display = 'flex';
        }
    }

    function handleEnterPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function handleCancelFile() {
        selectedFile = null;
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileUpload').value = '';
    }

    function handleCancelReply() {
        replyingTo = null;
        document.getElementById('replyPreview').style.display = 'none';
    }

    function handleLeaveRoom() {
        socket.emit('leaveRoom', { roomId: currentRoom });
        localStorage.removeItem('currentRoom');
        localStorage.removeItem('currentRoomName');
        window.location.href = '/rooms';
    }

    function initEmojiPicker() {
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiButton = document.getElementById('emojiButton');
        
        // Clear emoji picker
        emojiPicker.innerHTML = '';
        
        // Add emojis
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.textContent = emoji;
            span.onclick = (e) => {
                e.stopPropagation();
                const messageInput = document.getElementById('messageInput');
                messageInput.value += emoji;
                messageInput.focus();
            };
            emojiPicker.appendChild(span);
        });

        // Toggle emoji picker
        emojiButton.onclick = (e) => {
            e.stopPropagation();
            emojiPicker.style.display = emojiPicker.style.display === 'grid' ? 'none' : 'grid';
        };

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-picker') && !e.target.closest('.emoji-btn')) {
                emojiPicker.style.display = 'none';
            }
        });
    }

    function sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message && !selectedFile) return;

        if (selectedFile) {
            sendFileMessage(message);
        } else {
            socket.emit('message', {
                roomId: currentRoom,
                message
            });
            messageInput.value = '';
        }
    }

    function sendFileMessage(message) {
        const sendButton = document.getElementById('sendButton');
        sendButton.disabled = true;
        sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                socket.emit('message', {
                    roomId: currentRoom,
                    message: message,
                    file: {
                        name: selectedFile.name,
                        type: selectedFile.type,
                        size: selectedFile.size,
                        data: e.target.result
                    }
                });

                handleCancelFile();
                document.getElementById('messageInput').value = '';
            } catch (error) {
                alert('Error sending file. Please try again.');
                console.error('Error sending file:', error);
            } finally {
                sendButton.disabled = false;
                sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        };

        reader.onerror = function() {
            alert('Error reading file. Please try again.');
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
        };

        reader.readAsDataURL(selectedFile);
    }

    function handleNewMessage({ username: msgUsername, message, image, file, timestamp }) {
        if (message && message.hasOwnProperty('from')) return;
        console.log('Received message:', { msgUsername, message, image, file, timestamp });
        addMessageToChat(msgUsername, message, timestamp, image, file);
    }

    function handleChatHistory(messages) {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = '';
        messages.forEach(({ username: msgUsername, message, image, file, timestamp }) => {
            addMessageToChat(msgUsername, message, timestamp, image, file);
        });
    }

    function handleNotification({ message }) {
        console.log('Received notification:', message);
        const notificationElement = document.createElement('div');
        notificationElement.className = 'notification';
        notificationElement.textContent = message;
        const messagesContainer = document.getElementById('messages');
        messagesContainer.appendChild(notificationElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function handleMessageReadUpdate({ messageTimestamp, readBy }) {
        const messageElement = document.querySelector(`[data-timestamp="${messageTimestamp}"]`);
        if (messageElement) {
            updateReadStatus(messageElement, readBy);
        }
    }

    // เพิ่มฟังก์ชันสำหรับ emoji picker
    function initEmojiPicker() {
        const emojiPicker = document.getElementById('emojiPicker');
        
        // ล้าง emoji picker ก่อน
        emojiPicker.innerHTML = '';
        
        // เพิ่ม emoji ทั้งหมด
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.textContent = emoji;
            span.onclick = (e) => {
                e.stopPropagation(); // ป้องกันการปิด picker เมื่อคลิก emoji
                const messageInput = document.getElementById('messageInput');
                messageInput.value += emoji;
                messageInput.focus();
            };
            emojiPicker.appendChild(span);
        });

        // จัดการการแสดง/ซ่อน emoji picker
        const emojiButton = document.getElementById('emojiButton');
        emojiButton.onclick = (e) => {
            e.stopPropagation();
            const isVisible = emojiPicker.style.display === 'grid';
            emojiPicker.style.display = isVisible ? 'none' : 'grid';
        };

        // ปิด emoji picker เมื่อคลิกที่อื่น
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-picker') && !e.target.closest('.emoji-btn')) {
                emojiPicker.style.display = 'none';
            }
        });

        // ปิด emoji picker เมื่อกด Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                emojiPicker.style.display = 'none';
            }
        });
    }

    // เพิ่มฟังก์ชันตอบกลับข้อความ
    function replyToMessage(messageElement) {
        const username = messageElement.querySelector('.message-username').textContent;
        const message = messageElement.querySelector('.message-text').textContent;
        
        document.getElementById('replyUsername').textContent = username;
        document.getElementById('replyText').textContent = message;
        document.getElementById('replyPreview').style.display = 'flex';
        
        replyingTo = {
            username,
            message,
            timestamp: messageElement.dataset.timestamp
        };
    }

    // ฟังก์ชันแก้ไขข้อความ
    function editMessage(messageElement) {
        const messageText = messageElement.querySelector('.message-text').textContent;
        const messageInput = document.getElementById('messageInput');
        
        messageInput.value = messageText;
        messageInput.focus();
        editingMessage = messageElement.dataset.timestamp;
    }

    // ฟังก์ชันลบข้อความ
    function deleteMessage(timestamp) {
        socket.emit('deleteMessage', {
            roomId: currentRoom,
            messageTimestamp: timestamp
        });
    }

    // ฟังก์ชันค้นหาข้อความ
    function searchMessages(query) {
        const messages = document.querySelectorAll('.message-item');
        messages.forEach(message => {
            const text = message.querySelector('.message-text')?.textContent.toLowerCase();
            if (text && text.includes(query.toLowerCase())) {
                message.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
                message.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                message.style.backgroundColor = '';
            }
        });
    }

    // Event listeners
    document.getElementById('searchButton').onclick = () => {
        const query = document.getElementById('searchInput').value;
        if (query) {
            searchMessages(query);
        }
    };

    // Initialize
    initEmojiPicker();

    // เพิ่ม Intersection Observer สำหรับตรวจจับการอ่านข้อความ
    const messageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const messageElement = entry.target;
                const timestamp = messageElement.dataset.timestamp;
                if (timestamp) {
                    socket.emit('messageRead', {
                        roomId: currentRoom,
                        messageTimestamp: timestamp
                    });
                }
            }
        });
    }, {
        threshold: 0.5 // ต้องเห็น 50% ของข้อความถึงจะนับว่าอ่าน
    });

    // รับการอัพเดทสถานะการอ่าน
    socket.on('messageReadUpdate', ({ messageTimestamp, readBy }) => {
        const messageElement = document.querySelector(`[data-timestamp="${messageTimestamp}"]`);
        if (messageElement) {
            updateReadStatus(messageElement, readBy);
        }
    });

    // รับประวัติแชท
    socket.on('privateMessageHistory', (messages) => {
        messages.forEach(message => {
            const chatInfo = activeChats[message.from] || activeChats[message.to];
            if (chatInfo) {
                const messageElement = document.createElement('div');
                messageElement.className = `private-message ${message.from === username ? 'sent' : 'received'}`;
                messageElement.innerHTML = `
                    <span class="message-content">${message.message}</span>
                    <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
                `;
                chatInfo.messagesContainer.appendChild(messageElement);
            }
        });
        
        // เลื่อนไปที่ข้อความล่าสุด
        const lastChat = messages[messages.length - 1];
        if (lastChat) {
            const chatInfo = activeChats[lastChat.from] || activeChats[lastChat.to];
            if (chatInfo) {
                chatInfo.messagesContainer.scrollTop = chatInfo.messagesContainer.scrollHeight;
            }
        }
    });

    // Modal handling
    const modal = document.getElementById('imageModal');
    const modalClose = document.getElementsByClassName('modal-close')[0];

    // ปิด modal เมื่อคลิกที่ปุ่มปิด
    modalClose.onclick = function() {
        modal.style.display = "none";
    }

    // ปิด modal เมื่อคลิกที่พื้นหลัง
    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    }

    // ปิด modal เมื่อกด ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" && modal.style.display === "block") {
            modal.style.display = "none";
        }
    });

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

    // Helper function to format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ย้าย downloadFile ออกมาเป็น global function
    window.downloadFile = function(dataUrl, fileName) {
        try {
            // เปิดไฟล์ในแท็บใหม่
            const newWindow = window.open();
            newWindow.document.write(`
                <html>
                    <head>
                        <title>${fileName}</title>
                    </head>
                    <body style="margin:0;padding:0;">
                        <iframe src="${dataUrl}" style="width:100%;height:100vh;border:none;"></iframe>
                    </body>
                </html>
            `);
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Error opening file. Please try again.');
        }
    };

    // ลบ event listener เดิมของ userLeft ออก และใช้แบบใหม่
    socket.on('userLeft', (data) => {
        // แสดงข้อความแจ้งเตือนเท่านั้น
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = `${data.username} has left the room`;
        const messagesContainer = document.getElementById('messages');
        messagesContainer.appendChild(notification);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // แก้ไข CSS เพิ่มเติม
    const style = document.createElement('style');
    style.textContent = `
        .user-status {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .user-status.online {
            background-color: #2ecc71;
        }

        .user-status.offline {
            background-color: #95a5a6;
        }

        .no-users {
            color: var(--secondary-text);
            font-style: italic;
            text-align: center;
            padding: 10px;
        }

        .notification {
            text-align: center;
            color: var(--secondary-text);
            font-size: 0.9em;
            margin: 10px 0;
            font-style: italic;
        }

        .notification-dot {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 8px;
            background-color: #ff4444;
            border-radius: 50%;
            display: none;
        }

        .has-new-message .notification-dot {
            display: block;
        }

        .has-new-message {
            background-color: rgba(255, 68, 68, 0.1);
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }

        .notification-dot {
            animation: pulse 1s infinite;
        }
    `;
    document.head.appendChild(style);

    // ขอสิทธิ์แจ้งเตือนเมื่อโหลดหน้า
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // เก็บ active chats ไว้ใน object
    const activeChats = {};

    // เพิ่มฟังก์ชันสำหรับการแชทส่วนตัว
    function startPrivateChat(targetUser) {
        // ตรวจสอบว่ามี modal อยู่แล้วหรือไม่
        const existingModal = document.querySelector(`.private-chat-modal[data-user="${targetUser}"]`);
        if (existingModal) {
            existingModal.style.display = 'block';
            return;
        }

        // สร้าง modal สำหรับแชทส่วนตัว
        const modal = document.createElement('div');
        modal.className = 'private-chat-modal';
        modal.setAttribute('data-user', targetUser);
        modal.innerHTML = `
            <div class="private-chat-container">
                <div class="private-chat-header">
                    <div class="private-chat-user">
                        <i class="fas fa-user-circle"></i>
                        <span>${targetUser}</span>
                    </div>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="private-chat-messages"></div>
                <div class="private-chat-input">
                    <input type="text" placeholder="Type a message..." />
                    <button class="send-btn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('input');
        const sendBtn = modal.querySelector('.send-btn');
        const messagesContainer = modal.querySelector('.private-chat-messages');

        // จัดการการส่งข้อความ
        function sendPrivateMessage() {
            const message = input.value.trim();
            if (message) {
                socket.emit('privateMessage', {
                    to: targetUser,
                    message: message
                });
                
                // เพิ่มข้อความลงในแชท
                const messageElement = document.createElement('div');
                messageElement.className = 'private-message sent';
                messageElement.innerHTML = `
                    <div class="message-content">${message}</div>
                    <div class="message-time">${new Date().toLocaleTimeString()}</div>
                `;
                messagesContainer.appendChild(messageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                input.value = '';
            }
        }

        // Event listeners
        sendBtn.onclick = sendPrivateMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPrivateMessage();
            }
        };

        // ปิด modal
        modal.querySelector('.close-btn').onclick = () => {
            document.body.removeChild(modal);
            delete activeChats[targetUser];
        };

        // เก็บข้อมูลแชท
        activeChats[targetUser] = {
            modal,
            messagesContainer
        };

        // ดึงประวัติแชท
        socket.emit('getPrivateMessages', { withUser: targetUser });
    }

    // แก้ไขฟังก์ชัน addMessageToChat
    function addMessageToChat(msgUsername, message, timestamp, image = null, file = null, readBy = []) {
        // ตรวจสอบว่าเป็นข้อความส่วนตัวหรือไม่
        if (message && message.hasOwnProperty('from')) {
            return; // ข้ามการแสดงข้อความส่วนตัว
        }

        const messageElement = document.createElement('div');
        const isOwnMessage = msgUsername === username;
        messageElement.className = `message-item ${isOwnMessage ? 'sent' : 'received'}`;
        messageElement.dataset.timestamp = new Date(timestamp).toISOString();
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const usernameElement = document.createElement('div');
        usernameElement.className = 'message-username';
        usernameElement.textContent = msgUsername;
        
        messageContent.appendChild(usernameElement);

        if (file) {
            const fileContainer = document.createElement('div');
            fileContainer.className = 'file-message';
            
            let fileIcon = 'fa-file';
            if (file.type.includes('pdf')) fileIcon = 'fa-file-pdf';
            else if (file.type.includes('word')) fileIcon = 'fa-file-word';
            else if (file.type.includes('excel')) fileIcon = 'fa-file-excel';

            const fileName = file.name;
            const fileSize = formatFileSize(file.size);
            const downloadUrl = file.data;

            fileContainer.innerHTML = `
                <i class="fas ${fileIcon}"></i>
                <div class="file-message-info">
                    <div class="file-message-name" title="${fileName}">${fileName}</div>
                    <div class="file-message-size">${fileSize}</div>
                </div>
                <button class="file-download-btn" onclick="downloadFile('${downloadUrl}', '${fileName}')">
                    <i class="fas fa-external-link-alt"></i>
                    <span>Open</span>
                </button>
            `;
            
            messageContent.appendChild(fileContainer);
        }

        if (image) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'image-container';
            
            const imageElement = document.createElement('img');
            imageElement.src = image;
            imageElement.className = 'message-image';
            imageElement.onclick = () => {
                // แสดงรูปใน modal แทนการเปิดในแท็บใหม่
                const modal = document.getElementById('imageModal');
                const modalImg = document.getElementById('modalImage');
                const modalCaption = document.getElementById('modalCaption');
                
                modal.style.display = "block";
                modalImg.src = image;
                modalCaption.innerHTML = `Sent by ${msgUsername} at ${new Date(timestamp).toLocaleString()}`;
            };
            
            imageContainer.appendChild(imageElement);
            messageContent.appendChild(imageContainer);
        }

        if (message) {
            const messageText = document.createElement('div');
            messageText.className = 'message-text';
            messageText.textContent = message;
            messageContent.appendChild(messageText);
        }
        
        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(timestamp).toLocaleTimeString();
        messageContent.appendChild(timeElement);
        
        // เพิ่มส่วนแสดงสถานะการอ่าน
        const readStatus = document.createElement('div');
        readStatus.className = 'read-status';
        messageContent.appendChild(readStatus);
        
        messageElement.appendChild(messageContent);
        
        const messagesContainer = document.getElementById('messages');
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // เริ่มติดตามการอ่านข้อความ
        messageObserver.observe(messageElement);
        
        // อัพเดทสถานะการอ่านเริ่มต้น
        updateReadStatus(messageElement, readBy);
    }

    function updateReadStatus(messageElement, readBy) {
        const readStatus = messageElement.querySelector('.read-status');
        if (!readStatus) return;

        const isOwnMessage = messageElement.classList.contains('sent');
        if (isOwnMessage && readBy.length > 0) {
            // กรองตัวเองออกจากรายชื่อผู้อ่าน
            const otherReaders = readBy.filter(reader => reader !== username);
            if (otherReaders.length > 0) {
                readStatus.innerHTML = `
                    <span class="read-icon">
                        <i class="fas fa-check-double"></i>
                    </span>
                    <span class="read-count">Read by ${otherReaders.length}</span>
                `;
                readStatus.title = `Read by: ${otherReaders.join(', ')}`;
            }
        }
    }

    // อัพเดทฟังก์ชัน updateUsersList
    function updateUsersList(users) {
        console.log('Updating users list:', users);
        const usersList = document.querySelector('.users-list');
        if (!usersList) {
            console.error('Users list element not found');
            return;
        }
        
        usersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<div class="no-users">No users online</div>';
            return;
        }

        users.sort((a, b) => a.username.localeCompare(b.username));

        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            if (user.username !== username) {
                userElement.classList.add('clickable');
            }
            userElement.setAttribute('data-username', user.username);
            
            userElement.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="user-details">
                        <div class="user-name">
                            ${user.username} ${user.username === username ? '(You)' : ''}
                        </div>
                        <div class="user-status ${user.active ? 'online' : 'offline'}">
                            <span class="status-dot"></span>
                            ${user.active ? 'Online' : 'Offline'}
                        </div>
                    </div>
                </div>
            `;

            if (user.username !== username) {
                userElement.onclick = () => {
                    startPrivateChat(user.username);
                    // ปิด sidebar บนมือถือเมื่อเริ่มแชท
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('active');
                        overlay.classList.remove('active');
                    }
                };
            }

            usersList.appendChild(userElement);
        });
    }

    // อัพเดท CSS styles สำหรับ user list
    const userListStyles = document.createElement('style');
    userListStyles.textContent = `
        .users-list {
            padding: 15px;
            overflow-y: auto;
            max-height: calc(100vh - 200px);
        }

        .user-item {
            display: flex;
            align-items: center;
            padding: 16px;
            margin-bottom: 1px;
            background: var(--message-bg);
            transition: all 0.2s ease;
            position: relative;
        }

        .user-item.clickable {
            cursor: pointer;
        }

        .user-item.clickable:active {
            background: var(--hover-bg);
            transform: scale(0.98);
        }

        .user-item.clicked {
            background: var(--hover-bg);
            transform: scale(0.98);
        }

        .tap-hint {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 14px;
            color: var(--secondary-text);
            opacity: 0.7;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }

        .user-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--hover-bg);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .user-avatar i {
            font-size: 24px;
            color: var(--secondary-text);
        }

        .user-details {
            flex: 1;
            min-width: 0;
        }

        .user-name {
            font-size: 16px;
            font-weight: 500;
            color: var(--text-color);
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .user-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: var(--secondary-text);
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            flex-shrink: 0;
        }

        .online .status-dot {
            background-color: #2ecc71;
            box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.2);
        }

        .offline .status-dot {
            background-color: #95a5a6;
        }

        .no-users {
            text-align: center;
            color: var(--secondary-text);
            padding: 20px;
            font-style: italic;
        }

        @media (max-width: 768px) {
            .users-list {
                padding: 0;
            }

            .user-item {
                padding: 20px 16px;
                border-bottom: 1px solid var(--border-color);
            }

            .user-item:last-child {
                border-bottom: none;
            }

            .user-item.clickable:active {
                background: var(--hover-bg);
            }

            .tap-hint {
                display: none;
            }

            .user-avatar {
                width: 52px;
                height: 52px;
            }

            .user-avatar i {
                font-size: 26px;
            }

            .user-name {
                font-size: 17px;
                margin-bottom: 6px;
            }

            .user-status {
                font-size: 15px;
            }

            .status-dot {
                width: 12px;
                height: 12px;
            }
        }

        @media (hover: hover) {
            .user-item.clickable:hover {
                background: var(--hover-bg);
            }
            
            .tap-hint {
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            
            .user-item.clickable:hover .tap-hint {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(userListStyles);

    // เพิ่มฟังก์ชันสำหรับแจ้งเตือน
    function showNotification(title, body) {
        // ตรวจสอบการสนับสนุน Notifications
        if (!("Notification" in window)) {
            console.log("This browser does not support notifications");
            return;
        }

        // ขอสิทธิ์แจ้งเตือน
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        } else {
            const notification = new Notification(title, {
                body: body,
                icon: '/favicon.ico' // เพิ่มไอคอนตามต้องการ
            });

            // ปิดการแจ้งเตือนอัตโนมัติหลัง 5 วินาที
            setTimeout(() => {
                notification.close();
            }, 5000);

            // เมื่อคลิกที่การแจ้งเตือน
            notification.onclick = function() {
                window.focus();
                this.close();
            };
        }
    }

    // เพิ่ม HTML structure สำหรับ sidebar
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        // สร้าง sidebar element
        const sidebar = document.createElement('div');
        sidebar.className = 'chat-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>Online Users</h3>
            </div>
            <div class="users-list"></div>
        `;

        // สร้างปุ่ม toggle และ overlay
        const toggleButton = document.createElement('button');
        toggleButton.className = 'sidebar-toggle';
        toggleButton.innerHTML = '<i class="fas fa-bars"></i>';

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';

        // เพิ่ม elements เข้าไปใน DOM
        document.body.insertBefore(sidebar, chatContainer);
        document.body.appendChild(toggleButton);
        document.body.appendChild(overlay);

        // จัดการ event listeners
        toggleButton.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        });

        // ปิด sidebar เมื่อกด ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // เพิ่ม CSS styles
    const styles = document.createElement('style');
    styles.textContent = `
        .chat-container {
            position: relative;
            height: 100vh;
            overflow: hidden;
        }

        .chat-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            background: var(--bg-color);
            border-right: 1px solid var(--border-color);
            z-index: 999;
            transition: transform 0.3s ease;
        }

        .sidebar-header {
            padding: 20px;
            background: var(--primary-color);
            color: white;
        }

        .sidebar-header h3 {
            margin: 0;
            font-size: 18px;
        }

        .sidebar-toggle {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: var(--primary-color);
            color: white;
            border: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: none;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 1000;
            font-size: 24px;
        }

        .sidebar-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 998;
        }

        @media (max-width: 768px) {
            .chat-sidebar {
                transform: translateX(-100%);
                width: 100%;
                max-width: 320px;
            }

            .chat-sidebar.active {
                transform: translateX(0);
            }

            .sidebar-toggle {
                display: flex;
            }

            .sidebar-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .chat-main {
                margin-left: 0;
            }
        }
    `;
    document.head.appendChild(styles);

    // Add styles for private chat
    const privateChatStyles = document.createElement('style');
    privateChatStyles.textContent = `
        .private-chat-modal {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 400px;
            background: var(--bg-color);
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            display: none;
            flex-direction: column;
        }

        .private-chat-container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .private-chat-header {
            padding: 12px 16px;
            background: var(--primary-color);
            color: white;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .private-chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .private-chat-input {
            padding: 12px;
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 8px;
        }

        .private-chat-input input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 20px;
            outline: none;
        }

        .private-chat-input .send-btn {
            padding: 8px 16px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 20px;
            cursor: pointer;
        }

        .private-message {
            max-width: 80%;
            padding: 8px 12px;
            border-radius: 12px;
            margin: 4px 0;
            word-break: break-word;
        }

        .private-message.sent {
            align-self: flex-end;
            background: var(--primary-color);
            color: white;
        }

        .private-message.received {
            align-self: flex-start;
            background: var(--message-bg);
            color: var(--text-color);
        }

        .message-time {
            font-size: 0.8em;
            opacity: 0.7;
            margin-top: 4px;
        }
    `;
    document.head.appendChild(privateChatStyles);
}); 