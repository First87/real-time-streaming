const AIHandler = require('./ai-handler');
const aiHandler = new AIHandler();

io.on('connection', (socket) => {
    socket.on('message', async (data) => {
        const { room, message, isAIRoom } = data;
        
        io.to(room).emit('message', {
            user: socket.user.username,
            text: message,
            timestamp: Date.now()
        });

        if (isAIRoom) {
            io.to(room).emit('typing', {
                user: 'AI Assistant',
                isTyping: true
            });

            setTimeout(() => {
                const response = aiHandler.processMessage(message);
                
                io.to(room).emit('typing', {
                    user: 'AI Assistant',
                    isTyping: false
                });

                io.to(room).emit('message', {
                    user: 'AI Assistant',
                    text: response,
                    isAI: true,
                    timestamp: Date.now()
                });
            }, Math.random() * 1000 + 500);
        }
    });
}); 