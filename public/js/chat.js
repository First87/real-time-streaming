document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const currentRoom = localStorage.getItem('currentRoom');
    const currentRoomName = localStorage.getItem('currentRoomName');
    const username = localStorage.getItem('username');
    
    if (!token || !currentRoom) {
        window.location.href = '/rooms';
        return;
    }

    // แสดงชื่อห้องในส่วนหัว
    document.getElementById('roomName').textContent = currentRoomName;

    const socket = io({
        auth: {
            token: token
        }
    });

    // เข้าร่วมห้อง
    socket.emit('joinRoom', { roomId: currentRoom });

    // รับข้อความใหม่
    socket.on('message', ({ username: msgUsername, message, image, file, timestamp }) => {
        // ตรวจสอบว่าเป็นข้อความส่วนตัวหรือไม่
        if (message && message.hasOwnProperty('from')) {
            return; // ข้ามการแสดงข้อความส่วนตัว
        }
        
        console.log('Received message:', { msgUsername, message, image, file, timestamp });
        addMessageToChat(msgUsername, message, timestamp, image, file);
    });

    // รับประวัติการแชท
    socket.on('chatHistory', (messages) => {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = ''; // Clear existing messages
        messages.forEach(({ username: msgUsername, message, image, file, timestamp }) => {
            addMessageToChat(msgUsername, message, timestamp, image, file);
        });
    });

    // รับการแจ้งเตือน
    socket.on('notification', ({ message }) => {
        console.log('Received notification:', message);
        const notificationElement = document.createElement('div');
        notificationElement.className = 'notification';
        notificationElement.textContent = message;
        const messagesContainer = document.getElementById('messages');
        messagesContainer.appendChild(notificationElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // เพิ่มตัวแปรสำหรับเก็บรูปที่จะอัพโหลด
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

    // จัดการการอัพโหลดไฟล์
    document.getElementById('fileUpload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                alert('File size too large. Maximum size is 10MB.');
                return;
            }
            selectedFile = file;
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('filePreview').style.display = 'flex';
        }
    });

    // Context menu สำหรับข้อความ
    function showContextMenu(e, messageElement) {
        e.preventDefault();
        const contextMenu = document.getElementById('messageContextMenu');
        const isOwnMessage = messageElement.classList.contains('sent');
        
        // แสดงตัวเลือกที่เหมาะสม
        document.getElementById('editOption').style.display = isOwnMessage ? 'flex' : 'none';
        document.getElementById('deleteOption').style.display = isOwnMessage ? 'flex' : 'none';
        
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        
        // เก็บข้อมูลข้อความที่เลือก
        contextMenu.dataset.messageId = messageElement.dataset.timestamp;
    }

    // ปิด context menu เมื่อคลิกที่อื่น
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            document.getElementById('messageContextMenu').style.display = 'none';
        }
    });

    // ฟังก์ชันตอบกลับข้อความ
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

    document.getElementById('cancelFile').onclick = () => {
        selectedFile = null;
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileUpload').value = '';
    };

    document.getElementById('cancelReply').onclick = () => {
        replyingTo = null;
        document.getElementById('replyPreview').style.display = 'none';
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

    // เพิ่ม handler สำหรับข้อความส่วนตัว
    socket.on('privateMessage', (message) => {
        const chatInfo = activeChats[message.from] || activeChats[message.to];
        if (chatInfo) {
            const messageElement = document.createElement('div');
            messageElement.className = `private-message ${message.from === username ? 'sent' : 'received'}`;
            messageElement.innerHTML = `
                <span class="message-content">${message.message}</span>
                <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
            `;
            chatInfo.messagesContainer.appendChild(messageElement);
            chatInfo.messagesContainer.scrollTop = chatInfo.messagesContainer.scrollHeight;
        } else if (message.from !== username) {
            // แสดงการแจ้งเตือนถ้าไม่ได้เปิดแชทอยู่
            showNotification('New Private Message', `${message.from}: ${message.message}`);
            
            // เพิ่มจุดแจ้งเตือนที่รายชื่อผู้ใช้
            const userElement = document.querySelector(`[data-username="${message.from}"]`);
            if (userElement) {
                userElement.classList.add('has-new-message');
                if (!userElement.querySelector('.notification-dot')) {
                    const dot = document.createElement('span');
                    dot.className = 'notification-dot';
                    userElement.appendChild(dot);
                }
            }
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

    // ส่งข้อความ
    document.getElementById('sendButton').onclick = sendMessage;

    // Enter key สำหรับส่งข้อความ
    document.getElementById('messageInput').onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    function sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (selectedFile) {
            // เพิ่มการตรวจสอบขนาดไฟล์
            if (selectedFile.size > 10 * 1024 * 1024) { // 10MB
                alert('File size too large. Maximum size is 10MB.');
                return;
            }

            // แสดง loading state
            const sendButton = document.getElementById('sendButton');
            sendButton.disabled = true;
            sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const fileData = e.target.result;
                    socket.emit('message', {
                        roomId: currentRoom,
                        message: message,
                        file: {
                            name: selectedFile.name,
                            type: selectedFile.type,
                            size: selectedFile.size,
                            data: fileData
                        }
                    });

                    // รีเซ็ตหลังส่ง
                    selectedFile = null;
                    document.getElementById('filePreview').style.display = 'none';
                    document.getElementById('fileUpload').value = '';
                } catch (error) {
                    alert('Error sending file. Please try again.');
                    console.error('Error sending file:', error);
                } finally {
                    // รีเซ็ต button state
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
        } else if (message) {
            socket.emit('message', {
                roomId: currentRoom,
                message
            });
        }
        messageInput.value = '';
    }

    // Typing indicator
    let typingTimeout;
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
            const typingIndicator = document.getElementById('typingIndicator');
            typingIndicator.textContent = `${typingUsername} is typing...`;
            typingIndicator.style.display = 'block';
            
            clearTimeout(typingIndicator.timeout);
            typingIndicator.timeout = setTimeout(() => {
                typingIndicator.style.display = 'none';
            }, 1000);
        }
    });

    // ออกจากห้อง
    document.getElementById('leaveRoomBtn').onclick = () => {
        socket.emit('leaveRoom', { roomId: currentRoom });
        localStorage.removeItem('currentRoom');
        localStorage.removeItem('currentRoomName');
        window.location.href = '/rooms';
    };

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

    function startPrivateChat(targetUser) {
        // ตรวจสอบว่ามี modal อยู่แล้วหรือไม่
        const existingModal = document.querySelector(`.private-chat-modal[data-user="${targetUser}"]`);
        if (existingModal) {
            return;
        }

        // สร้าง modal
        const modal = document.createElement('div');
        modal.className = 'private-chat-modal';
        modal.setAttribute('data-user', targetUser);
        modal.innerHTML = `
            <div class="private-chat-container">
                <div class="private-chat-header">
                    <h3>Chat with ${targetUser}</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="private-chat-messages"></div>
                <div class="private-chat-input">
                    <input type="text" placeholder="Type a message...">
                    <button class="send-btn">Send</button>
                </div>
            </div>
        `;

        const messagesContainer = modal.querySelector('.private-chat-messages');
        const input = modal.querySelector('input');
        const sendBtn = modal.querySelector('.send-btn');

        // จัดการการส่งข้อความส่วนตัว
        sendBtn.onclick = () => {
            const message = input.value.trim();
            if (message) {
                // ใช้ privateMessage event แทน message event
                socket.emit('privateMessage', {
                    to: targetUser,
                    message: message
                });
                input.value = '';
            }
        };

        // จัดการการปิด modal
        modal.querySelector('.close-btn').onclick = () => {
            document.body.removeChild(modal);
            delete activeChats[targetUser];
        };

        // เก็บข้อมูลแชทที่กำลังใช้งาน
        activeChats[targetUser] = {
            modal,
            messagesContainer
        };

        document.body.appendChild(modal);

        // ดึงประวัติแชท
        socket.emit('getPrivateMessages', { withUser: targetUser });

        // ลบการแจ้งเตือนเมื่อเปิดแชท
        const userElement = document.querySelector(`[data-username="${targetUser}"]`);
        if (userElement) {
            userElement.classList.remove('has-new-message');
            const dot = userElement.querySelector('.notification-dot');
            if (dot) {
                dot.remove();
            }
        }
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

    // เพิ่ม event listener สำหรับ roomUsers
    socket.on('roomUsers', (data) => {
        console.log('Received room users:', data.users);
        updateUsersList(data.users);
    });

    // แก้ไขฟังก์ชัน updateUsersList
    function updateUsersList(users) {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<li class="no-users">No users online</li>';
            return;
        }

        users.forEach(user => {
            if (user.username !== username) { // ไม่แสดงตัวเอง
                const userElement = document.createElement('li');
                userElement.setAttribute('data-username', user.username);
                userElement.innerHTML = `
                    <span class="user-status ${user.active ? 'online' : 'offline'}"></span>
                    ${user.username}
                `;
                // เพิ่ม click event สำหรับเริ่มแชทส่วนตัว
                userElement.onclick = () => startPrivateChat(user.username);
                usersList.appendChild(userElement);
            }
        });
    }

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

    // เพิ่มปุ่ม toggle และ overlay ใน DOM
    document.body.insertAdjacentHTML('beforeend', `
        <button class="sidebar-toggle">
            <i class="fas fa-bars"></i>
        </button>
        <div class="sidebar-overlay"></div>
    `);

    // จัดการการเปิด/ปิด sidebar
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.chat-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebarToggle.onclick = () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    };

    // ปิด sidebar เมื่อคลิก overlay
    overlay.onclick = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    };

    // ปิด sidebar เมื่อคลิกที่รายชื่อผู้ใช้ (สำหรับ mobile)
    document.querySelectorAll('.users-list li').forEach(user => {
        user.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        });
    });
}); 