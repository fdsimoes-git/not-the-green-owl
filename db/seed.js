#!/usr/bin/env node
/**
 * Seed script for not-the-green-owl
 * Creates skills, levels, lessons, exercises, and achievements
 * Usage: node db/seed.js
 */

const pool = require('./pool');

async function seed() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ─── Skills ───
        const skillRows = await insertRows(client, 'skills', ['name', 'display_name', 'order_index'], [
            ['listening', 'Listening', 1],
            ['reading', 'Reading', 2],
            ['writing', 'Writing', 3],
            ['speaking', 'Speaking', 4],
        ]);
        const skills = {};
        skillRows.forEach(r => skills[r.name] = r.id);

        // ─── Levels (4 per skill) ───
        const levelDefs = [
            { name: 'beginner', display: 'Beginner', bandMin: 1, bandMax: 3.5, cefr: 'A1-A2', threshold: 0 },
            { name: 'intermediate', display: 'Intermediate', bandMin: 4, bandMax: 5.5, cefr: 'B1', threshold: 200 },
            { name: 'upper_intermediate', display: 'Upper-Intermediate', bandMin: 6, bandMax: 7, cefr: 'B2', threshold: 600 },
            { name: 'advanced', display: 'Advanced', bandMin: 7.5, bandMax: 9, cefr: 'C1-C2', threshold: 1500 },
        ];

        const levels = {};
        for (const skillName of Object.keys(skills)) {
            levels[skillName] = {};
            for (let i = 0; i < levelDefs.length; i++) {
                const ld = levelDefs[i];
                const res = await client.query(
                    `INSERT INTO levels (skill_id, name, display_name, band_min, band_max, cefr, unlock_threshold, order_index)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [skills[skillName], ld.name, ld.display, ld.bandMin, ld.bandMax, ld.cefr, ld.threshold, i + 1]
                );
                levels[skillName][ld.name] = res.rows[0].id;
            }
        }

        // ─── Lessons & Exercises ───

        // ===== READING BEGINNER (6 lessons) =====
        const rbLevel = levels.reading.beginner;

        await createLesson(client, rbLevel, 1, 'Everyday Signs & Notices', 'reading_comprehension', 10, 20, [
            mc('What does a sign saying "NO ENTRY" mean?',
                ['You cannot go in', 'You must pay to enter', 'Entry is free', 'Enter from the other side'],
                'You cannot go in', 2,
                '"No Entry" means you are not allowed to go in.'),
            mc('You see "PUSH" on a door. What should you do?',
                ['Pull the door', 'Push the door', 'Slide the door', 'Ring the bell'],
                'Push the door', 2,
                'The sign tells you the direction to open the door.'),
            mc('A sign reads "WET FLOOR". What does it warn about?',
                ['The floor is dirty', 'The floor is slippery', 'The floor is broken', 'The floor is new'],
                'The floor is slippery', 2,
                'Wet floor signs warn that the surface is slippery.'),
            tf('"OUT OF ORDER" on a lift means the lift is working well.', 'false', 2,
                '"Out of Order" means something is broken and not working.'),
            tf('"STAFF ONLY" means anyone can enter.', 'false', 2,
                '"Staff Only" means only employees are allowed.'),
            fb('A sign says "Opening Hours: 9 AM – 5 PM". The shop closes at ___ PM.', '5', 2,
                'The closing time is stated after the dash.'),
        ]);

        await createLesson(client, rbLevel, 2, 'Reading a Menu', 'reading_comprehension', 10, 20, [
            {
                type: 'multiple_choice', points: 2,
                question: { passage: 'SUNNY CAFÉ MENU\n\nBreakfast (served until 11 AM)\n- Full English: £8.50\n- Pancakes with Maple Syrup: £6.00\n- Toast & Jam: £3.00\n\nLunch (served 12 PM – 3 PM)\n- Chicken Sandwich: £7.50\n- Caesar Salad: £6.50\n- Soup of the Day: £4.50\n\nDrinks\n- Tea/Coffee: £2.50\n- Fresh Juice: £3.50',
                    question: 'How much does a Full English breakfast cost?',
                    options: ['£6.00', '£7.50', '£8.50', '£3.00'] },
                answer: '£8.50',
                explanation: 'The Full English is listed at £8.50 in the Breakfast section.'
            },
            mc('According to the menu above, when does breakfast service end?',
                ['10 AM', '11 AM', '12 PM', '3 PM'],
                '11 AM', 2,
                'The menu states breakfast is served until 11 AM.'),
            tf('You can order a Caesar Salad at 10 AM.', 'false', 2,
                'Lunch is served from 12 PM, so salad is not available at 10 AM.'),
            fb('The cheapest item on the entire menu is Toast & Jam at £___.', '3.00', 2,
                'Toast & Jam costs £3.00, the lowest price listed.'),
            mc('Which drink costs more?',
                ['Tea', 'Coffee', 'Fresh Juice', 'They cost the same'],
                'Fresh Juice', 2,
                'Fresh Juice is £3.50 while Tea/Coffee is £2.50.'),
        ]);

        await createLesson(client, rbLevel, 3, 'Understanding an Email', 'reading_comprehension', 10, 25, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'From: manager@brightoffice.com\nTo: all-staff@brightoffice.com\nSubject: Office Move – Important Information\n\nDear Team,\n\nI am writing to let you know that our office will move to a new location on March 15th. The new address is 42 Park Lane, London.\n\nPlease pack your personal belongings by March 14th. Boxes will be provided on March 12th. The IT team will handle all computer equipment.\n\nThe new office has a cafeteria on the ground floor and free parking. Our working hours will remain the same.\n\nBest regards,\nSarah Thompson\nOffice Manager',
                    question: 'What is the main purpose of this email?'
                },
                answer: 'To inform staff about the office relocation',
                explanation: 'The email communicates details about moving to a new office.'
            },
            mc('When will boxes be provided?',
                ['March 12th', 'March 14th', 'March 15th', 'March 10th'],
                'March 12th', 2, 'The email states boxes will be provided on March 12th.'),
            tf('Staff need to pack their own computers.', 'false', 2,
                'The email says the IT team will handle all computer equipment.'),
            fb('The new office address is 42 ___ Lane, London.', 'Park', 3,
                'The address given is 42 Park Lane.'),
            mc('What new facility does the new office have?',
                ['A gym', 'A cafeteria', 'A swimming pool', 'A library'],
                'A cafeteria', 2,
                'The email mentions a cafeteria on the ground floor.'),
            tf('Working hours will change after the move.', 'false', 2,
                'The email explicitly states working hours will remain the same.'),
        ]);

        await createLesson(client, rbLevel, 4, 'Bus Timetable', 'reading_comprehension', 10, 20, [
            {
                type: 'multiple_choice', points: 2,
                question: {
                    passage: 'BUS ROUTE 42 – City Centre to Airport\n\nCity Centre:  6:00  7:30  9:00  10:30  12:00\nMain Street:  6:12  7:42  9:12  10:42  12:12\nHospital:     6:25  7:55  9:25  10:55  12:25\nAirport:      6:45  8:15  9:45  11:15  12:45\n\nMonday–Saturday. No Sunday service.',
                    question: 'If you catch the 9:00 bus from City Centre, what time do you arrive at the Airport?'
                },
                answer: '9:45',
                explanation: 'The 9:00 departure arrives at the Airport at 9:45.'
            },
            mc('How long does the journey from City Centre to Airport take?',
                ['25 minutes', '35 minutes', '45 minutes', '1 hour'],
                '45 minutes', 2,
                'From 6:00 to 6:45 is 45 minutes.'),
            tf('You can catch Bus 42 on Sundays.', 'false', 2,
                'The timetable states there is no Sunday service.'),
            fb('The bus stops at ___ between Main Street and the Airport.', 'Hospital', 3,
                'The Hospital stop is between Main Street and Airport.'),
            mc('What is the last bus from City Centre?',
                ['10:30', '12:00', '12:45', '11:15'],
                '12:00', 2,
                'The last departure from City Centre is at 12:00.'),
        ]);

        await createLesson(client, rbLevel, 5, 'Restaurant Review', 'reading_comprehension', 10, 20, [
            {
                type: 'multiple_choice', points: 2,
                question: {
                    passage: 'REVIEW: The Golden Spoon ★★★★☆\n\nI visited The Golden Spoon last Saturday with friends. The restaurant is on the corner of Bridge Street, easy to find. We waited about 10 minutes for a table, which was fine.\n\nI ordered the grilled salmon, which was excellent. My friend had the steak – she said it was slightly overcooked. The desserts were amazing, especially the chocolate cake.\n\nPrices are reasonable: mains around £12–15. Service was friendly but a bit slow. I would recommend booking in advance on weekends.\n\nOverall: Great food, good value, just allow extra time.',
                    question: 'How many stars does the reviewer give?'
                },
                answer: '4 out of 5',
                explanation: 'The review shows 4 filled stars out of 5.'
            },
            mc('What was the problem with the steak?',
                ['It was cold', 'It was overcooked', 'It was too expensive', 'It was too small'],
                'It was overcooked', 2, 'The friend said the steak was slightly overcooked.'),
            tf('The reviewer visited alone.', 'false', 2,
                'The review says "with friends".'),
            fb('The reviewer especially liked the ___ cake.', 'chocolate', 2,
                'The review mentions the chocolate cake was amazing.'),
            mc('What advice does the reviewer give for weekends?',
                ['Arrive early', 'Book in advance', 'Avoid going', 'Go at lunchtime'],
                'Book in advance', 2,
                'The reviewer recommends booking in advance on weekends.'),
            tf('Main courses cost over £20.', 'false', 2,
                'Mains are around £12–15.'),
        ]);

        await createLesson(client, rbLevel, 6, 'Job Advertisement', 'reading_comprehension', 10, 25, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'SHOP ASSISTANT WANTED\n\nBright Books Ltd is looking for a part-time shop assistant.\n\nHours: Tuesday, Thursday, Saturday – 10 AM to 4 PM\nPay: £11.50 per hour\nLocation: 15 High Street, Manchester\n\nRequirements:\n- Must be over 18\n- Good communication skills\n- Experience with cash register preferred (not essential)\n\nTo apply, send your CV to jobs@brightbooks.co.uk by March 20th.',
                    question: 'How many days per week is this job?'
                },
                answer: '3 days',
                explanation: 'The job is Tuesday, Thursday, and Saturday – three days.'
            },
            mc('How much does the job pay per hour?',
                ['£10.00', '£11.00', '£11.50', '£12.00'],
                '£11.50', 2, 'The pay is stated as £11.50 per hour.'),
            tf('You must have experience with a cash register to apply.', 'false', 3,
                'Cash register experience is preferred but not essential.'),
            fb('Applications must be sent by March ___.', '20th', 2,
                'The deadline is March 20th.'),
            mc('What is the minimum age requirement?',
                ['16', '17', '18', '21'],
                '18', 2, 'Applicants must be over 18.'),
            {
                type: 'short_answer', points: 3,
                question: { question: 'What email address should you send your CV to?' },
                answer: 'jobs@brightbooks.co.uk',
                explanation: 'The application email is jobs@brightbooks.co.uk.'
            },
        ]);

        // ===== LISTENING BEGINNER (6 lessons) =====
        const lbLevel = levels.listening.beginner;

        await createLesson(client, lbLevel, 1, 'Asking for Directions', 'listening_comprehension', 10, 20, [
            mc('A person asks: "Excuse me, how do I get to the train station?" The reply is: "Go straight and turn left at the traffic lights." Where should they turn left?',
                ['At the bank', 'At the traffic lights', 'At the roundabout', 'At the second street'],
                'At the traffic lights', 2, 'The directions say to turn left at the traffic lights.'),
            tf('"It\'s on your right" means the place is on your left side.', 'false', 2,
                '"On your right" means the right-hand side.'),
            mc('Which phrase means the place is near?',
                ['"It\'s miles away"', '"It\'s just around the corner"', '"You need to take a bus"', '"It\'s across town"'],
                '"It\'s just around the corner"', 2,
                '"Just around the corner" means very close by.'),
            fb('"Go ___ for about 200 metres, then turn right." The missing word is the direction of walking without turning.', 'straight', 3,
                '"Go straight" means continue forward.'),
            mc('"Take the second turning on the left." How many streets do you pass before turning?',
                ['None', 'One', 'Two', 'Three'],
                'One', 2, 'You pass the first turning and take the second one.'),
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match each direction phrase to its meaning:',
                    items: ['Go straight', 'Turn left', 'It\'s opposite the bank', 'It\'s next to the shop'],
                    options: ['Continue forward', 'Go to the left side', 'Across the road from the bank', 'Beside the shop']
                },
                answer: ['Continue forward', 'Go to the left side', 'Across the road from the bank', 'Beside the shop'],
                explanation: 'Each direction phrase has a specific spatial meaning.'
            },
        ]);

        await createLesson(client, lbLevel, 2, 'Phone Booking', 'listening_comprehension', 10, 20, [
            mc('A caller says: "I\'d like to book a table for two, please." How many people is the booking for?',
                ['One', 'Two', 'Three', 'Four'],
                'Two', 2, '"A table for two" means two people.'),
            fb('"What name is the booking under?" "It\'s under ___." This means the person gives their ___.', 'name', 2,
                '"Under" in a booking context refers to the name of the person.'),
            mc('"Is that for this Friday or next Friday?" The receptionist is asking about:',
                ['The time', 'The date', 'The number of guests', 'The menu choice'],
                'The date', 2, 'The question is about which Friday (date).'),
            tf('"We\'re fully booked" means there are tables available.', 'false', 2,
                '"Fully booked" means no availability.'),
            mc('The receptionist says: "Could I take a contact number, please?" What do they want?',
                ['Your address', 'Your email', 'Your phone number', 'Your credit card'],
                'Your phone number', 2, '"Contact number" means phone number.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these phone booking steps in the correct order:',
                    items: [
                        'Give your name',
                        'Say how many people',
                        'Choose a date and time',
                        'Confirm the booking'
                    ]
                },
                answer: ['Say how many people', 'Choose a date and time', 'Give your name', 'Confirm the booking'],
                explanation: 'A typical booking follows this logical sequence.'
            },
        ]);

        await createLesson(client, lbLevel, 3, 'At the Shop', 'listening_comprehension', 10, 20, [
            mc('"How much is this?" is asking about:',
                ['The size', 'The colour', 'The price', 'The weight'],
                'The price', 2, '"How much" asks about the price.'),
            mc('"Do you have this in a medium?" The customer is asking about:',
                ['The price', 'The size', 'The colour', 'The brand'],
                'The size', 2, 'Medium refers to a size.'),
            tf('"That comes to £15.60" means you need to pay £15.60.', 'true', 2,
                '"Comes to" states the total price.'),
            fb('"Would you like a ___ with that?" The shop assistant offers a bag.', 'bag', 2,
                'Shop assistants commonly offer bags.'),
            mc('"I\'m just looking, thanks" means the customer:',
                ['Wants help', 'Is ready to buy', 'Is browsing without wanting help', 'Is looking for the exit'],
                'Is browsing without wanting help', 2,
                '"Just looking" is a polite way to decline assistance.'),
            mc('"Can I try this on?" means the customer wants to:',
                ['Buy the item', 'Return the item', 'Test if it fits', 'Get a discount'],
                'Test if it fits', 2,
                '"Try on" means to put on clothing to check the fit.'),
        ]);

        await createLesson(client, lbLevel, 4, 'Weather Forecast', 'listening_comprehension', 10, 20, [
            mc('"Expect heavy rain this afternoon." What weather is predicted?',
                ['Sunshine', 'Snow', 'Heavy rain', 'Fog'],
                'Heavy rain', 2, '"Heavy rain" means a lot of rain.'),
            tf('"Partly cloudy" means the sky will be completely covered in clouds.', 'false', 2,
                '"Partly cloudy" means some clouds but also some clear sky.'),
            fb('"Temperatures will reach a high of ___ degrees." If you hear "twenty-two", write the number.', '22', 2,
                'The temperature high is 22 degrees.'),
            mc('"There\'s a chance of showers in the evening." "Showers" means:',
                ['Hot weather', 'Brief periods of rain', 'Thunderstorms', 'Snowfall'],
                'Brief periods of rain', 2,
                'Showers are short, light periods of rain.'),
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match the weather words to their descriptions:',
                    items: ['Overcast', 'Breeze', 'Frost', 'Heatwave'],
                    options: ['Completely cloudy sky', 'Gentle wind', 'Ice on surfaces in cold weather', 'Period of unusually hot weather']
                },
                answer: ['Completely cloudy sky', 'Gentle wind', 'Ice on surfaces in cold weather', 'Period of unusually hot weather'],
                explanation: 'These are common weather terms used in forecasts.'
            },
            mc('"Winds coming from the north-west." This tells you:',
                ['The temperature', 'The wind direction', 'The rainfall amount', 'The cloud type'],
                'The wind direction', 2, 'This describes where the wind is coming from.'),
        ]);

        await createLesson(client, lbLevel, 5, 'At the Library', 'listening_comprehension', 10, 20, [
            mc('"Your books are due back on the 15th." What does "due back" mean?',
                ['You can keep them forever', 'You must return them by that date', 'You can renew them', 'They are free'],
                'You must return them by that date', 2,
                '"Due back" means the return deadline.'),
            tf('"You can borrow up to 6 books" means you can take a maximum of 6 books.', 'true', 2,
                '"Up to 6" means 6 is the maximum.'),
            mc('"Would you like to renew that?" means:',
                ['Return the book', 'Extend the borrowing period', 'Pay a fine', 'Buy the book'],
                'Extend the borrowing period', 2,
                '"Renew" means to extend the loan period.'),
            fb('"There\'s a late ___ of 10p per day." The missing word means a charge for returning late.', 'fee', 2,
                'A late fee is charged when books are returned past the due date.'),
            mc('"The reference section is on the second floor." Where are the reference books?',
                ['Ground floor', 'First floor', 'Second floor', 'Basement'],
                'Second floor', 2, 'The librarian says second floor.'),
        ]);

        await createLesson(client, lbLevel, 6, 'Meeting People', 'listening_comprehension', 10, 20, [
            mc('"Nice to meet you" is used when:',
                ['Saying goodbye', 'Meeting someone for the first time', 'Ordering food', 'Making a complaint'],
                'Meeting someone for the first time', 2,
                'This is a standard greeting when meeting someone new.'),
            mc('"What do you do?" is asking about:',
                ['Your hobbies', 'Your job', 'Your age', 'Your name'],
                'Your job', 2,
                '"What do you do?" is a common way to ask about someone\'s occupation.'),
            tf('"Where are you from?" asks about your nationality or home city.', 'true', 2,
                'This question asks about your place of origin.'),
            fb('"I\'m a ___ at the local hospital." If someone works treating patients, they might be a doctor or ___.', 'nurse', 2,
                'Nurses and doctors treat patients at hospitals.'),
            mc('"How long have you been here?" is asking about:',
                ['Distance', 'Duration of stay', 'Price', 'Temperature'],
                'Duration of stay', 2,
                '"How long" asks about the length of time.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put this introduction conversation in order:',
                    items: [
                        '"Nice to meet you too!"',
                        '"Hi, I\'m Sarah."',
                        '"What do you do?"',
                        '"Hello, my name is Tom. Nice to meet you."'
                    ]
                },
                answer: ['"Hi, I\'m Sarah."', '"Hello, my name is Tom. Nice to meet you."', '"Nice to meet you too!"', '"What do you do?"'],
                explanation: 'Introductions follow a natural greeting sequence.'
            },
        ]);

        // ===== WRITING BEGINNER (3 lessons) =====
        const wbLevel = levels.writing.beginner;

        await createLesson(client, wbLevel, 1, 'Writing a Short Message', 'writing', 15, 25, [
            {
                type: 'essay_prompt', points: 5,
                question: {
                    topic: 'Write a short message (3-4 sentences) to your friend. Tell them about your plans this weekend.',
                    modelAnswer: 'Hi Alex,\n\nI hope you are well. This weekend, I am planning to go to the park with my family on Saturday. On Sunday, I will visit the new shopping centre in town. Would you like to come?\n\nSee you soon,\nMaria'
                },
                answer: null,
                explanation: 'A good short message has a greeting, clear information, and a sign-off.'
            },
            mc('Which is the correct way to start an informal message to a friend?',
                ['Dear Sir/Madam,', 'To Whom It May Concern,', 'Hi Tom,', 'I am writing to inform you that'],
                'Hi Tom,', 2, 'Informal messages to friends use "Hi" + name.'),
            mc('Which ending is best for a message to a friend?',
                ['Yours faithfully', 'Yours sincerely', 'See you soon!', 'I look forward to hearing from you at your earliest convenience'],
                'See you soon!', 2, 'Informal messages use casual endings.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these parts of a short message in order:',
                    items: ['Sign-off (See you soon)', 'Greeting (Hi/Dear...)', 'Main message (your news)', 'Your name']
                },
                answer: ['Greeting (Hi/Dear...)', 'Main message (your news)', 'Sign-off (See you soon)', 'Your name'],
                explanation: 'Messages follow: greeting → content → closing → name.'
            },
            fb('When writing to a friend, we use ___ language, not formal.', 'informal', 2,
                'Messages to friends are informal/casual.'),
        ]);

        await createLesson(client, wbLevel, 2, 'Describing a Picture', 'writing', 15, 25, [
            {
                type: 'essay_prompt', points: 6,
                question: {
                    topic: 'Describe what you can see in a typical city street scene. Write 4-5 sentences. Include details about buildings, people, and transport.',
                    modelAnswer: 'The picture shows a busy city street during the daytime. There are several tall buildings on both sides of the road, including shops and offices. Many people are walking on the pavement, and some are waiting at a bus stop. There are cars and buses on the road, and a cyclist is riding in the bicycle lane. The weather looks sunny, and there are a few clouds in the sky.'
                },
                answer: null,
                explanation: 'Good descriptions mention location, people, objects, and atmosphere.'
            },
            mc('Which phrase is useful for starting a picture description?',
                ['"I think that..."', '"In the picture, I can see..."', '"My opinion is..."', '"The reason is..."'],
                '"In the picture, I can see..."', 2,
                'This is a standard phrase for beginning picture descriptions.'),
            mc('Which word describes position?',
                ['Beautiful', 'Next to', 'Quickly', 'However'],
                'Next to', 2, '"Next to" describes the position of something.'),
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match the position words to their meanings:',
                    items: ['In the foreground', 'In the background', 'On the left', 'In the centre'],
                    options: ['At the front of the picture', 'At the back of the picture', 'On the left side', 'In the middle']
                },
                answer: ['At the front of the picture', 'At the back of the picture', 'On the left side', 'In the middle'],
                explanation: 'These phrases help describe where things are in a picture.'
            },
        ]);

        await createLesson(client, wbLevel, 3, 'Filling in a Form', 'writing', 10, 20, [
            fb('On a form, "Surname" means your ___ name (family name).', 'last', 2,
                'Surname = last name = family name.'),
            mc('"Date of birth" asks for:',
                ['Today\'s date', 'Your birthday', 'The date you started school', 'Your age'],
                'Your birthday', 2, 'Date of birth is when you were born.'),
            mc('What does "Postcode" mean on a UK form?',
                ['Your phone number', 'Your area code for mail delivery', 'Your email', 'Your passport number'],
                'Your area code for mail delivery', 2,
                'A postcode identifies a specific area for mail delivery.'),
            tf('"Nationality" on a form asks where you live now.', 'false', 2,
                'Nationality is the country you are a citizen of, not where you currently live.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these form fields in a typical order:',
                    items: ['Email address', 'Full name', 'Signature', 'Date of birth']
                },
                answer: ['Full name', 'Date of birth', 'Email address', 'Signature'],
                explanation: 'Forms typically start with name, then personal details, contact info, and end with signature.'
            },
            fb('"Marital status" asks if you are single, married, or ___.', 'divorced', 2,
                'Common marital statuses are: single, married, divorced, widowed.'),
        ]);

        // ===== SPEAKING BEGINNER (3 lessons) =====
        const sbLevel = levels.speaking.beginner;

        await createLesson(client, sbLevel, 1, 'Introducing Yourself', 'speaking', 10, 20, [
            {
                type: 'speaking_prompt', points: 5,
                question: {
                    question: 'Introduce yourself. Include: your name, where you are from, what you do (job/study), and one hobby.',
                    prepTime: 30,
                    speakTime: 60
                },
                answer: null,
                explanation: 'A good introduction covers basic personal information clearly and confidently.'
            },
            mc('In IELTS Speaking Part 1, you should:',
                ['Give very long answers', 'Give short, clear answers with some detail', 'Only say yes or no', 'Read from notes'],
                'Give short, clear answers with some detail', 2,
                'Part 1 requires brief but developed answers.'),
            mc('Which is better for Part 1: "Yes." or "Yes, I enjoy reading, especially novels."?',
                ['Yes.', 'Yes, I enjoy reading, especially novels.', 'Both are equally good', 'Neither is good'],
                'Yes, I enjoy reading, especially novels.', 2,
                'Extended answers show better language ability.'),
            tf('You should memorise answers for IELTS Speaking.', 'false', 2,
                'Memorised answers sound unnatural and examiners can detect them.'),
        ]);

        await createLesson(client, sbLevel, 2, 'Talking About Your Home', 'speaking', 10, 20, [
            {
                type: 'speaking_prompt', points: 5,
                question: {
                    question: 'Describe where you live. Talk about: the type of home (flat/house), the area, what you like about it, and one thing you would change.',
                    prepTime: 30,
                    speakTime: 90
                },
                answer: null,
                explanation: 'Describe your living situation with specific details and personal opinions.'
            },
            mc('Which phrase adds detail to your answer?',
                ['"I live in a house."', '"I live in a small terraced house near the city centre, which I share with my family."', '"House. Centre. Family."', '"My house is a house."'],
                '"I live in a small terraced house near the city centre, which I share with my family."', 3,
                'Adding adjectives, location, and extra information shows language range.'),
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match the housing vocabulary:',
                    items: ['Detached house', 'Flat', 'Terraced house', 'Cottage'],
                    options: ['Stands alone, not joined to others', 'An apartment in a building', 'Joined to houses on both sides', 'A small house in the countryside']
                },
                answer: ['Stands alone, not joined to others', 'An apartment in a building', 'Joined to houses on both sides', 'A small house in the countryside'],
                explanation: 'Knowing housing vocabulary helps in IELTS Speaking Part 1.'
            },
            fb('"My favourite thing about my home is the ___." Complete with something you like (e.g., garden, view, location).', 'garden', 2,
                'Expressing preferences shows you can give opinions.'),
        ]);

        await createLesson(client, sbLevel, 3, 'Daily Routine', 'speaking', 10, 20, [
            {
                type: 'speaking_prompt', points: 5,
                question: {
                    question: 'Describe a typical day for you. Include: what time you wake up, your morning routine, your main activity (work/study), and what you do in the evening.',
                    prepTime: 30,
                    speakTime: 90
                },
                answer: null,
                explanation: 'Use time expressions and sequence words to organise your answer.'
            },
            mc('Which sequence word helps organise a daily routine description?',
                ['"However"', '"After that"', '"In conclusion"', '"On the other hand"'],
                '"After that"', 2, '"After that" helps sequence events in time.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these time expressions in order from morning to night:',
                    items: ['In the evening', 'First thing in the morning', 'Around lunchtime', 'In the afternoon']
                },
                answer: ['First thing in the morning', 'Around lunchtime', 'In the afternoon', 'In the evening'],
                explanation: 'Time expressions help structure daily routine descriptions.'
            },
            tf('"I usually wake up at 7" uses the present simple tense for routines.', 'true', 2,
                'We use present simple for habitual actions and daily routines.'),
        ]);

        // ===== PLACEHOLDER LESSONS for remaining levels =====
        const placeholderLevels = [
            { skill: 'reading', level: 'intermediate', titles: ['Newspaper Articles', 'Academic Passages', 'Opinion Texts'] },
            { skill: 'reading', level: 'upper_intermediate', titles: ['Complex Arguments', 'Research Summaries', 'Critical Analysis'] },
            { skill: 'reading', level: 'advanced', titles: ['Academic Journals', 'Abstract Reasoning', 'Synthesis Tasks'] },
            { skill: 'listening', level: 'intermediate', titles: ['Conversations', 'Monologues', 'Note Completion'] },
            { skill: 'listening', level: 'upper_intermediate', titles: ['Lectures', 'Discussions', 'Summary Tasks'] },
            { skill: 'listening', level: 'advanced', titles: ['Academic Talks', 'Complex Dialogues', 'Inference Tasks'] },
            { skill: 'writing', level: 'intermediate', titles: ['Letter Writing', 'Graph Description', 'Short Essays'] },
            { skill: 'writing', level: 'upper_intermediate', titles: ['Task 1 Reports', 'Task 2 Essays', 'Complex Arguments'] },
            { skill: 'writing', level: 'advanced', titles: ['Academic Reports', 'Discursive Essays', 'Evaluative Writing'] },
            { skill: 'speaking', level: 'intermediate', titles: ['Part 1 Practice', 'Part 2 Cue Cards', 'Part 3 Discussions'] },
            { skill: 'speaking', level: 'upper_intermediate', titles: ['Extended Topics', 'Abstract Ideas', 'Debate Practice'] },
            { skill: 'speaking', level: 'advanced', titles: ['Complex Topics', 'Hypothetical Scenarios', 'Academic Discussion'] },
        ];

        for (const pl of placeholderLevels) {
            const levelId = levels[pl.skill][pl.level];
            for (let i = 0; i < pl.titles.length; i++) {
                await createLesson(client, levelId, i + 1, pl.titles[i], 'mixed', 15, 20, [
                    mc(`This is a placeholder exercise for "${pl.titles[i]}". What skill does this lesson develop?`,
                        ['Listening', 'Reading', 'Writing', 'Speaking'],
                        pl.skill.charAt(0).toUpperCase() + pl.skill.slice(1), 3,
                        'This lesson is part of the ' + pl.skill + ' skill.'),
                    tf('IELTS has four sections: Listening, Reading, Writing, and Speaking.', 'true', 2,
                        'IELTS tests all four language skills.'),
                    fb('The IELTS band scale goes from 1 to ___.', '9', 2,
                        'IELTS scores range from band 1 to band 9.'),
                ]);
            }
        }

        // ─── Achievements ───
        const achievementDefs = [
            ['first_lesson', 'First Steps', 'Complete your first lesson', '{"type":"lessons_completed","count":1}', 10],
            ['five_lessons', 'Getting Started', 'Complete 5 lessons', '{"type":"lessons_completed","count":5}', 25],
            ['ten_lessons', 'Dedicated Learner', 'Complete 10 lessons', '{"type":"lessons_completed","count":10}', 50],
            ['twenty_five_lessons', 'Lesson Master', 'Complete 25 lessons', '{"type":"lessons_completed","count":25}', 100],
            ['fifty_lessons', 'Half Century', 'Complete 50 lessons', '{"type":"lessons_completed","count":50}', 200],
            ['perfect_score', 'Perfectionist', 'Score 100% on any lesson', '{"type":"perfect_score"}', 30],
            ['streak_3', 'On a Roll', 'Maintain a 3-day streak', '{"type":"streak","days":3}', 15],
            ['streak_7', 'Week Warrior', 'Maintain a 7-day streak', '{"type":"streak","days":7}', 30],
            ['streak_14', 'Fortnight Fighter', 'Maintain a 14-day streak', '{"type":"streak","days":14}', 60],
            ['streak_30', 'Monthly Master', 'Maintain a 30-day streak', '{"type":"streak","days":30}', 150],
            ['xp_100', 'XP Starter', 'Earn 100 total XP', '{"type":"total_xp","amount":100}', 10],
            ['xp_500', 'XP Collector', 'Earn 500 total XP', '{"type":"total_xp","amount":500}', 25],
            ['xp_1000', 'XP Hunter', 'Earn 1,000 total XP', '{"type":"total_xp","amount":1000}', 50],
            ['xp_5000', 'XP Champion', 'Earn 5,000 total XP', '{"type":"total_xp","amount":5000}', 200],
            ['reading_beginner', 'Bookworm Beginner', 'Complete all Reading Beginner lessons', '{"type":"level_complete","skill":"reading","level":"beginner"}', 50],
            ['listening_beginner', 'Ear Training', 'Complete all Listening Beginner lessons', '{"type":"level_complete","skill":"listening","level":"beginner"}', 50],
            ['writing_beginner', 'Pen Pal', 'Complete all Writing Beginner lessons', '{"type":"level_complete","skill":"writing","level":"beginner"}', 50],
            ['speaking_beginner', 'Finding Your Voice', 'Complete all Speaking Beginner lessons', '{"type":"level_complete","skill":"speaking","level":"beginner"}', 50],
            ['band_5', 'Band 5 Reached', 'Reach an estimated band score of 5.0', '{"type":"band_reached","band":5}', 75],
            ['band_7', 'Band 7 Reached', 'Reach an estimated band score of 7.0', '{"type":"band_reached","band":7}', 200],
        ];

        for (const [name, displayName, description, criteria, xpBonus] of achievementDefs) {
            await client.query(
                `INSERT INTO achievements (name, display_name, description, criteria_json, xp_bonus) VALUES ($1, $2, $3, $4, $5)`,
                [name, displayName, description, criteria, xpBonus]
            );
        }

        await client.query('COMMIT');
        console.log('Seed completed successfully!');
        console.log(`  Skills: 4`);
        console.log(`  Levels: 16`);
        console.log(`  Achievements: ${achievementDefs.length}`);
        console.log('  Lessons & exercises: created for all levels');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// ─── Helpers ───

async function insertRows(client, table, columns, rows) {
    const results = [];
    for (const row of rows) {
        const placeholders = row.map((_, i) => `$${i + 1}`).join(', ');
        const res = await client.query(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            row
        );
        results.push(res.rows[0]);
    }
    return results;
}

async function createLesson(client, levelId, orderIndex, title, lessonType, durationMin, xpReward, exercises) {
    const lessonRes = await client.query(
        `INSERT INTO lessons (level_id, title, lesson_type, xp_reward, duration_min, order_index)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [levelId, title, lessonType, xpReward, durationMin, orderIndex]
    );
    const lessonId = lessonRes.rows[0].id;

    for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await client.query(
            `INSERT INTO exercises (lesson_id, exercise_type, question_json, answer_json, points, order_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                lessonId,
                ex.type,
                JSON.stringify(ex.question),
                JSON.stringify(ex.answer),
                ex.points,
                i + 1
            ]
        );
    }
    return lessonId;
}

function mc(question, options, answer, points, explanation) {
    return {
        type: 'multiple_choice',
        points,
        question: { question, options },
        answer,
        explanation
    };
}

function tf(statement, answer, points, explanation) {
    return {
        type: 'true_false_ng',
        points,
        question: { question: statement },
        answer,
        explanation
    };
}

function fb(question, answer, points, explanation) {
    return {
        type: 'fill_blank',
        points,
        question: { question },
        answer,
        explanation
    };
}

seed();
