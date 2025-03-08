class AIHandler {
    constructor() {
        this.responses = {
            greeting: [
                'สวัสดีครับ ยินดีต้อนรับครับ 😊',
                'หวัดดีครับ มีอะไรให้ช่วยไหม? 👋',
                'สวัสดีครับ วันนี้มีอะไรให้ช่วยไหม? 🌟'
            ],
            help: [
                'ต้องการให้ช่วยอะไรครับ? 🤝',
                'ยินดีให้ความช่วยเหลือครับ บอกผมได้เลย 💪',
                'มีอะไรให้ช่วยบอกได้เลยครับ ✨'
            ],
            thanks: [
                'ด้วยความยินดีครับ 🙏',
                'ยินดีให้บริการครับ ☺️',
                'ไม่เป็นไรครับ ยินดีช่วยเหลือ 💖'
            ],
            bye: [
                'ลาก่อนครับ ขอบคุณที่ใช้บริการ 👋',
                'บายครับ หวังว่าจะได้พบกันใหม่ 🌈',
                'แล้วพบกันใหม่นะครับ ✨'
            ],
            weather: [
                'วันนี้อากาศดีครับ ☀️',
                'ตอนนี้อากาศกำลังดีเลยครับ 🌤️',
                'อากาศวันนี้เหมาะกับการพักผ่อนครับ 🌺'
            ],
            time: [
                `ขณะนี้เวลา ${new Date().toLocaleTimeString('th-TH')} นาฬิกาครับ ⏰`,
                `ตอนนี้เวลา ${new Date().toLocaleTimeString('th-TH')} แล้วครับ 🕐`
            ],
            joke: [
                'ทำไมไก่ข้ามถนน? เพราะอยากไปอีกฝั่งไงครับ 😄',
                'รู้ไหมครับ ทำไมปลาไม่ชอบเล่นเฟซบุ๊ก? เพราะกลัวติดแหง็ก 😆',
                'วันๆ นั่งเล่นแต่คอม พอเมื่อยก็คอมพัก 😅'
            ],
            food: [
                'อาหารไทยอร่อยที่สุดในโลกครับ 🍜',
                'แนะนำส้มตำไทยครับ เผ็ดๆ ร้อนๆ 🌶️',
                'ผมชอบผัดไทยครับ คุณล่ะชอบอะไร? 🥘'
            ],
            music: [
                'เพลงช่วยให้ผ่อนคลายได้ดีครับ 🎵',
                'ดนตรีช่วยให้อารมณ์ดีครับ 🎼',
                'เปิดเพลงฟังสบายๆ ดีครับ 🎹'
            ],
            default: [
                'ขออภัยครับ ไม่เข้าใจคำถาม กรุณาถามใหม่อีกครั้ง 🤔',
                'ขอโทษครับ ช่วยถามใหม่อีกครั้งได้ไหมครับ? 🙏',
                'ไม่เข้าใจครับ ช่วยอธิบายใหม่ได้ไหมครับ? 💭'
            ]
        };

        this.keywords = {
            greeting: ['สวัสดี', 'หวัดดี', 'ทักทาย', 'hi', 'hello', 'ดี'],
            help: ['ช่วย', 'ขอ', 'อยาก', 'ต้องการ', 'help', 'ช่วยหน่อย'],
            thanks: ['ขอบคุณ', 'thank', 'ขอบใจ', 'บคุณ', 'ขอบ'],
            bye: ['ลาก่อน', 'บาย', 'bye', 'เจอกัน', 'ไปก่อน'],
            weather: ['อากาศ', 'ฝน', 'ร้อน', 'หนาว', 'weather', 'ฝนตก'],
            time: ['กี่โมง', 'เวลา', 'time', 'นาฬิกา'],
            joke: ['ตลก', 'ขำ', 'joke', 'มุก', 'เล่นมุก'],
            food: ['อาหาร', 'กิน', 'หิว', 'ข้าว', 'food', 'อร่อย'],
            music: ['เพลง', 'ดนตรี', 'music', 'ร้องเพลง', 'ฟังเพลง']
        };
    }

    findIntent(message) {
        message = message.toLowerCase();
        
        // ตรวจสอบแต่ละ intent
        for (const [intent, keywords] of Object.entries(this.keywords)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                return intent;
            }
        }

        // ถ้าเป็นคำถาม
        if (message.includes('?') || message.includes('ไหม') || message.includes('มั้ย')) {
            return 'help';
        }

        return 'default';
    }

    getResponse(message) {
        const intent = this.findIntent(message);
        const possibleResponses = this.responses[intent];
        return possibleResponses[Math.floor(Math.random() * possibleResponses.length)];
    }

    processMessage(message) {
        // ถ้าข้อความสั้นเกินไป
        if (message.length < 2) {
            return 'ขอความกรุณาพิมพ์ข้อความให้ยาวกว่านี้นะครับ 🙏';
        }

        // ถ้าเป็นตัวเลขล้วนๆ
        if (/^\d+$/.test(message)) {
            return `นั่นคือตัวเลข ${message} ครับ มีอะไรให้ช่วยไหมครับ? 🔢`;
        }

        // ถ้าเป็นคำถามเกี่ยวกับ AI
        if (message.toLowerCase().includes('ai') || message.toLowerCase().includes('bot')) {
            return 'ผมเป็น AI Chat Bot ที่พร้อมจะช่วยเหลือคุณครับ 🤖';
        }

        // ถ้าเป็นคำด่า
        if (this.containsBadWords(message)) {
            return 'ขออภัยครับ กรุณาใช้คำสุภาพนะครับ 🙏';
        }

        // ถ้าไม่ตรงเงื่อนไขพิเศษ ใช้การตอบปกติ
        return this.getResponse(message);
    }

    containsBadWords(message) {
        const badWords = ['เหี้ย', 'ควย', 'สัส', 'ไอ้', 'มึง', 'กู', 'เย็ด'];
        return badWords.some(word => message.toLowerCase().includes(word));
    }
}

module.exports = AIHandler; 