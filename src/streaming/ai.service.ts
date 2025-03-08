import { Injectable } from '@nestjs/common';
import axios from 'axios';
import nlp from 'compromise';
import { NlpManager } from 'node-nlp';

interface Conversation {
    messages: string[];
    context: {
        username: string;
        lastIntent: string;
        mood: string;
        topics: Set<string>;
        lastInteraction: Date;
        memory: {
            lastQuestion?: string;
            lastTopic?: string;
            sentiment?: number;
            keywords?: string[];
            userPreferences?: {
                foods?: string[];
                music?: string[];
                interests?: string[];
            };
            facts?: {
                [key: string]: any;
            };
        };
    };
}

interface KnowledgeBase {
  thailand: {
    provinces: {
      count: number;
      list: string[];
      regions: {
        north: string[];
        northeast: string[];
        central: string[];
        east: string[];
        west: string[];
        south: string[];
      };
    };
    population: number;
    capital: string;
    language: string;
  };
  general: {
    [key: string]: any;
  };
}

@Injectable()
export class AIService {
    private conversations: Map<string, Conversation> = new Map();
    private readonly CONTEXT_TIMEOUT = 1000 * 60 * 5; // 5 minutes
    private nlpManager: NlpManager;

    private knowledgeBase: KnowledgeBase = {
        thailand: {
            provinces: {
                count: 77,
                list: [
                    'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร',
                    'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
                    'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง',
                    'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
                    'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส',
                    'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
                    'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา',
                    'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
                    'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน',
                    'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง',
                    'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย',
                    'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
                    'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี',
                    'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
                    'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์',
                    'อุทัยธานี', 'อุบลราชธานี'
                ],
                regions: {
                    north: ['เชียงใหม่', 'เชียงราย', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'],
                    northeast: ['กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี'],
                    central: ['กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'อ่างทอง', 'อุทัยธานี'],
                    east: ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'],
                    west: ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'],
                    south: ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ยะลา', 'ระนอง', 'สงขลา', 'สตูล', 'สุราษฎร์ธานี']
                }
            },
            population: 69950850,
            capital: 'กรุงเทพมหานคร',
            language: 'ไทย'
        },
        general: {}
    };

    private specializedKnowledge = {
        history: {
            capitals: [
                { name: 'สุโขทัย', period: 'พ.ศ. 1792-1981', details: 'เป็นราชธานีแห่งแรกของไทย' },
                { name: 'อยุธยา', period: 'พ.ศ. 1893-2310', details: 'เป็นราชธานีที่ยาวนานที่สุด รวม 417 ปี' },
                { name: 'ธนบุรี', period: 'พ.ศ. 2310-2325', details: 'เป็นราชธานีในสมัยกรุงธนบุรี' },
                { name: 'กรุงเทพมหานคร', period: 'พ.ศ. 2325-ปัจจุบัน', details: 'เป็นเมืองหลวงปัจจุบันของประเทศไทย' }
            ],
            importantEvents: [
                { year: 1238, event: 'สถาปนากรุงสุโขทัย' },
                { year: 1350, event: 'สถาปนากรุงศรีอยุธยา' },
                { year: 1767, event: 'เสียกรุงศรีอยุธยาครั้งที่ 2' },
                { year: 1782, event: 'สถาปนากรุงรัตนโกสินทร์' },
                { year: 1932, event: 'การเปลี่ยนแปลงการปกครอง' }
            ]
        },
        culture: {
            festivals: [
                { name: 'สงกรานต์', date: '13-15 เมษายน', details: 'ประเพณีปีใหม่ไทย' },
                { name: 'ลอยกระทง', date: 'วันเพ็ญเดือน 12', details: 'ประเพณีลอยกระทงเพื่อขอขมาพระแม่คงคา' }
            ],
            food: {
                dishes: ['ต้มยำกุ้ง', 'ผัดไทย', 'แกงเขียวหวาน', 'ส้มตำ', 'มัสมั่น'],
                regions: {
                    north: ['ข้าวซอย', 'น้ำพริกหนุ่ม', 'แกงฮังเล'],
                    northeast: ['ส้มตำ', 'ลาบ', 'ก้อย'],
                    central: ['ต้มยำ', 'แกงเขียวหวาน', 'ผัดไทย'],
                    south: ['แกงเหลือง', 'ไก่ทอดหาดใหญ่', 'ข้าวยำ']
                }
            }
        }
    };

    constructor() {
        this.initializeNLP();
    }

    private async initializeNLP() {
        this.nlpManager = new NlpManager({ languages: ['th'] });
        
        // เพิ่มประโยคตัวอย่างสำหรับการรู้จำ intent
        this.nlpManager.addDocument('th', 'สวัสดี', 'greeting');
        this.nlpManager.addDocument('th', 'หวัดดี', 'greeting');
        this.nlpManager.addDocument('th', 'ขอบคุณ', 'thanks');
        this.nlpManager.addDocument('th', 'ขอบใจ', 'thanks');
        this.nlpManager.addDocument('th', 'ลาก่อน', 'bye');
        this.nlpManager.addDocument('th', 'บาย', 'bye');

        // เพิ่มคำตอบสำหรับแต่ละ intent
        this.nlpManager.addAnswer('th', 'greeting', 'สวัสดีครับ ยินดีต้อนรับครับ 😊');
        this.nlpManager.addAnswer('th', 'thanks', 'ด้วยความยินดีครับ 🙏');
        this.nlpManager.addAnswer('th', 'bye', 'ลาก่อนครับ ขอบคุณที่ใช้บริการ 👋');

        // ฝึกฝนโมเดล
        await this.nlpManager.train();
    }

    async processMessage(message: string, userId: string = 'default'): Promise<string> {
        try {
            const conversation = this.getOrCreateConversation(userId);
            const context = conversation.context;

            // เก็บข้อความในประวัติ
            conversation.messages.push(message);
            if (conversation.messages.length > 10) {
                conversation.messages.shift();
            }

            // ตรวจสอบคำห้าม
            if (this.containsBadWords(message)) {
                return 'ขออภัยครับ กรุณาใช้คำสุภาพในการสนทนาครับ 🙏';
            }

            // ตรวจสอบคำถามต่อเนื่อง
            if (this.isFollowUpQuestion(message, context)) {
                const followUpAnswer = await this.handleFollowUpQuestion(message, context);
                if (followUpAnswer) {
                    return followUpAnswer;
                }
            }

            // ตรวจสอบคำถามเกี่ยวกับประวัติศาสตร์
            if (this.isHistoricalQuestion(message)) {
                return this.getHistoricalAnswer(message, context);
            }

            // ตรวจสอบคำถามเกี่ยวกับวัฒนธรรม
            if (this.isCulturalQuestion(message)) {
                return this.getCulturalAnswer(message, context);
            }

            // ค้นหาคำตอบจากฐานความรู้
            const answer = await this.findAnswer(message);
            if (answer) {
                context.memory.lastTopic = 'knowledge';
                context.memory.lastQuestion = message;
                return answer;
            }

            // ถ้าไม่พบคำตอบในฐานความรู้ ค้นหาจาก Wikipedia
            const wikiAnswer = await this.searchWikipedia(message);
            if (wikiAnswer) {
                context.memory.lastTopic = 'wikipedia';
                context.memory.lastQuestion = message;
                return wikiAnswer;
            }

            // ถ้าไม่พบคำตอบที่เหมาะสม
            return this.getDefaultResponse(message, context.username);
        } catch (error) {
            console.error('Error processing message:', error);
            return 'ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้งครับ 🙏';
        }
    }

    private getDefaultResponse(message: string, username: string): string {
        // ตรวจสอบคำทักทาย
        if (message.includes('สวัสดี') || message.includes('หวัดดี')) {
            return 'สวัสดีครับ ยินดีต้อนรับครับ 😊';
        }

        // ตรวจสอบคำขอบคุณ
        if (message.includes('ขอบคุณ') || message.includes('ขอบใจ')) {
            return 'ด้วยความยินดีครับ 🙏';
        }

        // ตรวจสอบคำลา
        if (message.includes('ลาก่อน') || message.includes('บาย')) {
            return 'ลาก่อนครับ ขอบคุณที่ใช้บริการ 👋';
        }

        const defaultResponses = [
            'ขออภัยครับ ผมไม่เข้าใจคำถามนี้ คุณช่วยถามใหม่ได้ไหมครับ? 🤔',
            'คุณช่วยอธิบายเพิ่มเติมได้ไหมครับ? ผมอยากเข้าใจคำถามให้ชัดเจนกว่านี้ 🙏',
            'ขออภัยครับ คุณช่วยถามในรูปแบบอื่นได้ไหมครับ? 🤝',
            'ผมยังไม่แน่ใจว่าเข้าใจคำถามถูกต้อง คุณช่วยถามใหม่ได้ไหมครับ? 🤔'
        ];
        
        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    }

    private analyzeSentiment(message: string): number {
        const positiveWords = ['ดี', 'เยี่ยม', 'สุดยอด', 'ชอบ', 'รัก', 'สนุก', 'มีความสุข'];
        const negativeWords = ['แย่', 'เศร้า', 'เสียใจ', 'เหนื่อย', 'ท้อ', 'โกรธ', 'เกลียด'];
        
        let score = 0;
        const words = message.toLowerCase().split(' ');
        
        words.forEach(word => {
            if (positiveWords.includes(word)) score += 1;
            if (negativeWords.includes(word)) score -= 1;
        });
        
        return score;
    }

    private isFollowUpQuestion(message: string, context: Conversation['context']): boolean {
        const followUpKeywords = ['แล้ว', 'ต่อ', 'เพิ่มเติม', 'อีก', 'ด้วย'];
        const hasFollowUpKeyword = followUpKeywords.some(keyword => message.includes(keyword));
        
        return hasFollowUpKeyword && context.memory.lastTopic !== undefined;
    }

    private async handleFollowUpQuestion(message: string, context: Conversation['context']): Promise<string> {
        const lastTopic = context.memory.lastTopic;
        const lastQuestion = context.memory.lastQuestion;

        if (lastTopic === 'thailand') {
            if (message.includes('ภาค') || message.includes('จังหวัด')) {
                return this.getRegionalInfo(message, context);
            }
        }

        if (lastTopic === 'history') {
            if (message.includes('ต่อมา') || message.includes('หลังจากนั้น')) {
                return this.getHistoricalTimeline(lastQuestion, message);
            }
        }

        // ถ้าไม่สามารถหาคำตอบที่เกี่ยวข้องได้
        return 'ขออภัยครับ คุณช่วยถามให้เฉพาะเจาะจงกว่านี้ได้ไหมครับ? 🤔';
    }

    private isHistoricalQuestion(message: string): boolean {
        const historicalKeywords = [
            'ประวัติศาสตร์', 'อดีต', 'สมัยก่อน', 'ราชวงศ์', 
            'กรุงศรีอยุธยา', 'รัตนโกสินทร์', 'สุโขทัย', 'ธนบุรี',
            'รัชกาล', 'พระมหากษัตริย์', 'สงคราม'
        ];
        return historicalKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }

    private getHistoricalAnswer(message: string, context: Conversation['context']): string {
        const lowerMessage = message.toLowerCase();
        
        // เก็บบริบทการสนทนา
        context.memory.lastTopic = 'history';
        context.memory.lastQuestion = message;

        // คำถามเกี่ยวกับเมืองหลวง
        if (message.includes('เมืองหลวง')) {
            const capitals = this.specializedKnowledge.history.capitals;
            if (message.includes('กี่')) {
                return `ประเทศไทยมีเมืองหลวงมาแล้วทั้งหมด ${capitals.length} แห่งครับ ได้แก่:\n` +
                    capitals.map(c => `${c.name} (${c.period})`).join('\n') + ' 🏛️';
            }
            // ถามเกี่ยวกับเมืองหลวงเฉพาะ
            for (const capital of capitals) {
                if (message.includes(capital.name)) {
                    return `${capital.name} เป็นเมืองหลวงในช่วง${capital.period} ${capital.details} 🏛️`;
                }
            }
        }

        // คำถามเกี่ยวกับเหตุการณ์สำคัญ
        if (message.includes('เหตุการณ์') || message.includes('เกิดอะไร')) {
            const events = this.specializedKnowledge.history.importantEvents;
            const eventList = events.map(e => `พ.ศ. ${e.year + 543}: ${e.event}`).join('\n');
            return `เหตุการณ์สำคัญในประวัติศาสตร์ไทย:\n${eventList} 📜`;
        }

        return 'ขออภัยครับ คุณช่วยถามเกี่ยวกับประวัติศาสตร์ให้เฉพาะเจาะจงกว่านี้ได้ไหมครับ? 🤔';
    }

    private isCulturalQuestion(message: string): boolean {
        const culturalKeywords = [
            'วัฒนธรรม', 'ประเพณี', 'เทศกาล', 'อาหาร', 
            'การแต่งกาย', 'การละเล่น', 'ศิลปะ', 'ดนตรี'
        ];
        return culturalKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }

    private getCulturalAnswer(message: string, context: Conversation['context']): string {
        const lowerMessage = message.toLowerCase();
        
        // เก็บบริบทการสนทนา
        context.memory.lastTopic = 'culture';
        context.memory.lastQuestion = message;

        // คำถามเกี่ยวกับเทศกาล
        if (message.includes('เทศกาล') || message.includes('ประเพณี')) {
            const festivals = this.specializedKnowledge.culture.festivals;
            return `เทศกาลสำคัญของไทย:\n` +
                festivals.map(f => `${f.name}: ${f.date} - ${f.details}`).join('\n') + ' 🎊';
        }

        // คำถามเกี่ยวกับอาหาร
        if (message.includes('อาหาร')) {
            const food = this.specializedKnowledge.culture.food;
            if (message.includes('ภาค')) {
                const region = Object.entries(food.regions).find(([key]) => 
                    message.includes(key === 'north' ? 'เหนือ' : 
                        key === 'northeast' ? 'อีสาน' : 
                        key === 'central' ? 'กลาง' : 'ใต้')
                );
                if (region) {
                    return `อาหารประจำภาค${region[0] === 'north' ? 'เหนือ' : 
                        region[0] === 'northeast' ? 'อีสาน' : 
                        region[0] === 'central' ? 'กลาง' : 'ใต้'}:\n` +
                        region[1].join(', ') + ' 🍜';
                }
            }
            return `อาหารไทยที่มีชื่อเสียง:\n${food.dishes.join(', ')} 🍜`;
        }

        return 'ขออภัยครับ คุณช่วยถามเกี่ยวกับวัฒนธรรมให้เฉพาะเจาะจงกว่านี้ได้ไหมครับ? 🤔';
    }

    private getContextAwareResponse(message: string, context: Conversation['context']): string {
        // ตรวจสอบบริบทการสนทนาก่อนหน้า
        if (context.lastIntent) {
            switch (context.lastIntent) {
                case 'food':
                    if (message.includes('อร่อย') || message.includes('ชอบ')) {
                        context.memory.userPreferences = context.memory.userPreferences || {};
                        context.memory.userPreferences.foods = context.memory.userPreferences.foods || [];
                        context.memory.userPreferences.foods.push(message);
                        return 'ดีเลยครับ ผมจะจำไว้ว่าคุณชอบอาหารแบบนี้ 😊 มีอาหารจานอื่นที่ชอบอีกไหมครับ?';
                    }
                    break;
                case 'music':
                    if (message.includes('ฟัง') || message.includes('ชอบ')) {
                        context.memory.userPreferences = context.memory.userPreferences || {};
                        context.memory.userPreferences.music = context.memory.userPreferences.music || [];
                        context.memory.userPreferences.music.push(message);
                        return 'เพลงที่คุณชอบฟังเพราะมากเลยครับ 🎵 อยากแนะนำเพลงอื่นๆ อีกไหมครับ?';
                    }
                    break;
            }
        }

        // ถ้าไม่มีบริบทพิเศษ ใช้การตอบกลับทั่วไป
        return this.getDefaultResponse(message, context.username);
    }

    private async findAnswer(message: string): Promise<string | null> {
        const lowerMessage = message.toLowerCase();

        // คำถามเกี่ยวกับจังหวัด
        if (lowerMessage.includes('กี่จังหวัด')) {
            if (lowerMessage.includes('ประเทศไทย') || lowerMessage.includes('ไทย')) {
                return `ประเทศไทยมีทั้งหมด ${this.knowledgeBase.thailand.provinces.count} จังหวัด ครับ 🗺️\n\nแบ่งตามภูมิภาคได้ดังนี้:\n- ภาคเหนือ: ${this.knowledgeBase.thailand.provinces.regions.north.length} จังหวัด\n- ภาคตะวันออกเฉียงเหนือ: ${this.knowledgeBase.thailand.provinces.regions.northeast.length} จังหวัด\n- ภาคกลาง: ${this.knowledgeBase.thailand.provinces.regions.central.length} จังหวัด\n- ภาคตะวันออก: ${this.knowledgeBase.thailand.provinces.regions.east.length} จังหวัด\n- ภาคตะวันตก: ${this.knowledgeBase.thailand.provinces.regions.west.length} จังหวัด\n- ภาคใต้: ${this.knowledgeBase.thailand.provinces.regions.south.length} จังหวัด`;
            }
        }

        // คำถามเกี่ยวกับภูมิภาค
        const regions = {
            'ภาคเหนือ': this.knowledgeBase.thailand.provinces.regions.north,
            'ภาคอีสาน': this.knowledgeBase.thailand.provinces.regions.northeast,
            'ภาคตะวันออกเฉียงเหนือ': this.knowledgeBase.thailand.provinces.regions.northeast,
            'ภาคกลาง': this.knowledgeBase.thailand.provinces.regions.central,
            'ภาคตะวันออก': this.knowledgeBase.thailand.provinces.regions.east,
            'ภาคตะวันตก': this.knowledgeBase.thailand.provinces.regions.west,
            'ภาคใต้': this.knowledgeBase.thailand.provinces.regions.south
        };

        for (const [region, provinces] of Object.entries(regions)) {
            if (lowerMessage.includes(region.toLowerCase()) && 
                (lowerMessage.includes('จังหวัด') || lowerMessage.includes('มีอะไร'))) {
                return `${region}ของประเทศไทยมี ${provinces.length} จังหวัด ได้แก่:\n${provinces.join(', ')} 🏔️`;
            }
        }

        // คำถามเกี่ยวกับประชากร
        if ((lowerMessage.includes('ประชากร') || lowerMessage.includes('คนไทย') || lowerMessage.includes('พลเมือง')) && 
            (lowerMessage.includes('ประเทศไทย') || lowerMessage.includes('ไทย'))) {
            return `ประเทศไทยมีประชากรประมาณ ${this.knowledgeBase.thailand.population.toLocaleString()} คน (ข้อมูลล่าสุดปี 2566) 👥`;
        }

        // คำถามเกี่ยวกับเมืองหลวง
        if (lowerMessage.includes('เมืองหลวง') && 
            (lowerMessage.includes('ประเทศไทย') || lowerMessage.includes('ไทย'))) {
            return `เมืองหลวงของประเทศไทยคือ ${this.knowledgeBase.thailand.capital} 🏙️`;
        }

        // ถ้าไม่พบคำตอบในฐานความรู้ ให้ค้นหาจาก Wikipedia
        return await this.searchWikipedia(message);
    }

    private async searchWikipedia(query: string): Promise<string | null> {
        try {
            // ค้นหาบทความที่ตรงกับคำค้น
            const searchResponse = await axios.get('https://th.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: query,
                    format: 'json',
                    utf8: 1,
                    origin: '*'
                }
            });

            if (searchResponse.data.query.search.length === 0) {
                return null;
            }

            // ดึงบทความแรกที่พบ
            const firstResult = searchResponse.data.query.search[0];
            const contentResponse = await axios.get('https://th.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    pageids: firstResult.pageid,
                    prop: 'extracts',
                    exintro: 1,
                    explaintext: 1,
                    format: 'json',
                    utf8: 1,
                    origin: '*'
                }
            });

            const pages = contentResponse.data.query.pages;
            const pageContent = pages[firstResult.pageid].extract;

            if (pageContent) {
                // ตัดให้สั้นลงและเพิ่มลิงก์
                const shortContent = pageContent.substring(0, 300);
                const wikiLink = `https://th.wikipedia.org/?curid=${firstResult.pageid}`;
                return `${shortContent}...\n\nอ่านเพิ่มเติมได้ที่: ${wikiLink} 📚`;
            }

            return null;
        } catch (error) {
            console.error('Wikipedia search error:', error);
            return null;
        }
    }

    private containsBadWords(message: string): boolean {
        const badWords = ['เหี้ย', 'ควย', 'สัส', 'ไอ้', 'มึง', 'กู', 'เย็ด', 'หี', 'สัตว์'];
        return badWords.some(word => message.toLowerCase().includes(word));
    }

    private getOrCreateConversation(userId: string): Conversation {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, {
                messages: [],
                context: {
                    username: userId,
                    lastIntent: '',
                    mood: 'neutral',
                    topics: new Set(),
                    lastInteraction: new Date(),
                    memory: {}
                }
            });
        }
        return this.conversations.get(userId);
    }

    private isRecentInteraction(lastInteraction: Date): boolean {
        return (new Date().getTime() - lastInteraction.getTime()) < this.CONTEXT_TIMEOUT;
    }

    private getRegionalInfo(message: string, context: Conversation['context']): string {
        const regions = {
            'เหนือ': this.knowledgeBase.thailand.provinces.regions.north,
            'อีสาน': this.knowledgeBase.thailand.provinces.regions.northeast,
            'ตะวันออกเฉียงเหนือ': this.knowledgeBase.thailand.provinces.regions.northeast,
            'กลาง': this.knowledgeBase.thailand.provinces.regions.central,
            'ตะวันออก': this.knowledgeBase.thailand.provinces.regions.east,
            'ตะวันตก': this.knowledgeBase.thailand.provinces.regions.west,
            'ใต้': this.knowledgeBase.thailand.provinces.regions.south
        };

        // หาภาคที่ถูกถามถึง
        for (const [regionName, provinces] of Object.entries(regions)) {
            if (message.includes(regionName)) {
                return `ภาค${regionName}มีทั้งหมด ${provinces.length} จังหวัด ได้แก่:\n${provinces.join(', ')} 🗺️`;
            }
        }

        // ถ้าถามเกี่ยวกับจังหวัดทั้งหมด
        if (message.includes('ทั้งหมด') || message.includes('ทุกจังหวัด')) {
            return `ประเทศไทยมีทั้งหมด ${this.knowledgeBase.thailand.provinces.count} จังหวัด แบ่งตามภาค ดังนี้:\n
ภาคเหนือ (${this.knowledgeBase.thailand.provinces.regions.north.length} จังหวัด)
ภาคตะวันออกเฉียงเหนือ (${this.knowledgeBase.thailand.provinces.regions.northeast.length} จังหวัด)
ภาคกลาง (${this.knowledgeBase.thailand.provinces.regions.central.length} จังหวัด)
ภาคตะวันออก (${this.knowledgeBase.thailand.provinces.regions.east.length} จังหวัด)
ภาคตะวันตก (${this.knowledgeBase.thailand.provinces.regions.west.length} จังหวัด)
ภาคใต้ (${this.knowledgeBase.thailand.provinces.regions.south.length} จังหวัด) 🗺️`;
        }

        return 'ขออภัยครับ คุณต้องการทราบข้อมูลภาคไหนครับ? 🤔';
    }

    private getHistoricalTimeline(lastQuestion: string, currentMessage: string): string {
        const capitals = this.specializedKnowledge.history.capitals;
        const events = this.specializedKnowledge.history.importantEvents;

        // ถ้าก่อนหน้านี้ถามเกี่ยวกับเมืองหลวง
        if (lastQuestion.includes('เมืองหลวง')) {
            for (let i = 0; i < capitals.length; i++) {
                if (lastQuestion.includes(capitals[i].name)) {
                    // ถ้ามีเมืองหลวงถัดไป
                    if (i + 1 < capitals.length) {
                        const nextCapital = capitals[i + 1];
                        return `หลังจาก${capitals[i].name} ต่อมาคือ${nextCapital.name} (${nextCapital.period}) ${nextCapital.details} 🏛️`;
                    } else {
                        return `${capitals[i].name} เป็นเมืองหลวงสุดท้ายและยังคงเป็นเมืองหลวงจนถึงปัจจุบัน 🏙️`;
                    }
                }
            }
        }

        // ถ้าก่อนหน้านี้ถามเกี่ยวกับเหตุการณ์
        if (lastQuestion.includes('เหตุการณ์')) {
            const sortedEvents = [...events].sort((a, b) => a.year - b.year);
            return `เหตุการณ์สำคัญในประวัติศาสตร์ไทยเรียงตามลำดับเวลา:\n${
                sortedEvents.map(e => `พ.ศ. ${e.year + 543}: ${e.event}`).join('\n')
            } 📜`;
        }

        return 'ขออภัยครับ คุณต้องการทราบข้อมูลประวัติศาสตร์ช่วงไหนเพิ่มเติมครับ? 🤔';
    }

    private cleanupOldConversations() {
        const now = new Date().getTime();
        for (const [userId, conversation] of this.conversations.entries()) {
            if (now - conversation.context.lastInteraction.getTime() > this.CONTEXT_TIMEOUT) {
                this.conversations.delete(userId);
            }
        }
    }
} 