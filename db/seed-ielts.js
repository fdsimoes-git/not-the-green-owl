#!/usr/bin/env node
/**
 * IELTS Practice Seed — adds intermediate+ lessons with original
 * IELTS-style exercises (inspired by the IELTS format, not sourced
 * from any published test materials).
 * 
 * Run AFTER the main seed: node db/seed-ielts.js
 * 
 * ⚠️  This script DELETES existing lessons/exercises for the target
 *     levels before re-seeding. Do NOT run against production without
 *     the --force flag.
 * 
 * All reading passages, questions, and model answers are original
 * content created for this project.
 */

require('dotenv').config();
const { pool } = require('./pool');

async function seedIELTS() {
    // Safety guard: only allow in development/test without --force
    const env = process.env.NODE_ENV;
    if (env !== 'development' && env !== 'test' && !process.argv.includes('--force')) {
        console.error(
            `ERROR: seed-ielts.js refuses to run in "${env || 'unset'}" environment.\n` +
            'This script deletes and re-creates lessons. Only allowed in development/test.\n' +
            'If you really mean it, pass --force.'
        );
        process.exitCode = 1;
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get existing level IDs
        const levels = {};
        const { rows: levelRows } = await client.query(`
            SELECT l.id, l.name AS level_name, s.name AS skill_name 
            FROM levels l JOIN skills s ON l.skill_id = s.id
        `);
        for (const r of levelRows) {
            if (!levels[r.skill_name]) levels[r.skill_name] = {};
            levels[r.skill_name][r.level_name] = r.id;
        }

        // Guard lookups
        for (const skill of ['reading', 'listening', 'writing', 'speaking']) {
            for (const level of ['intermediate', 'upper_intermediate', 'advanced']) {
                const skillLevels = levels[skill];
                if (!skillLevels || typeof skillLevels[level] === 'undefined') {
                    throw new Error(`Missing level mapping for skill="${skill}", level="${level}".`);
                }
                const levelId = skillLevels[level];
                
                await client.query(`DELETE FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE level_id = $1)`, [levelId]);
                await client.query(`DELETE FROM lessons WHERE level_id = $1`, [levelId]);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // READING — INTERMEDIATE (Band 4–5.5)
        // ═══════════════════════════════════════════════════════════

        const riLevel = levels.reading.intermediate;

        // Lesson 1: Fire & Technology passage (original IELTS-style content)
        // Change all lesson types in the calls to 'practice' per schema constraint
    // (Used 'practice' for consistency with schema constraint 'practice','quiz','review')
    await createLesson(client, riLevel, 1, 'A Spark, a Flint: History of Fire', 'practice', 20, 30, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'To early humans, fire was a divine gift randomly delivered in the form of lightning, forest fires or burning lava. Unable to make flame for themselves, the earliest peoples probably stored fire by keeping slow-burning logs alight or by carrying charcoal in pots.\n\nHow and where humans learnt to produce flame at will is unknown. It was probably a secondary invention, accidentally made during tool-making operations with wood or stone. Studies of primitive societies suggest that the earliest method of making fire was through friction. European peasants would insert a wooden drill in a round hole and rotate it briskly between their palms. This process could be speeded up by wrapping a cord around the drill and pulling on each end.\n\nThe Ancient Greeks used lenses or concave mirrors to concentrate the sun\'s rays. Percussion methods of fire-lighting date back to Paleolithic times, when some Stone Age tool-makers discovered that chipping flints produced sparks. The technique became more efficient after the discovery of iron, about 5000 years ago.',
                    question: 'According to the passage, what was probably the earliest method of making fire?',
                    options: ['Using lenses to focus sunlight', 'Friction with wooden tools', 'Striking flints together', 'Carrying charcoal in pots']
                },
                answer: 'Friction with wooden tools',
                explanation: 'The passage states: "Studies of primitive societies suggest that the earliest method of making fire was through friction."'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'Early humans could easily create fire whenever they wanted.' },
                answer: 'false',
                explanation: 'The passage says they were "unable to make flame for themselves" and stored fire instead.'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'The Ancient Greeks used mirrors to start fires.' },
                answer: 'true',
                explanation: 'The passage states: "The Ancient Greeks used lenses or concave mirrors to concentrate the sun\'s rays."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'European peasants would insert a wooden drill in a round hole and ___ it briskly between their palms.' },
                answer: 'rotate',
                explanation: 'The passage uses the word "rotate" to describe the friction method.'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'Iron was discovered approximately 5000 years ago.' },
                answer: 'true',
                explanation: 'The passage states "the discovery of iron, about 5000 years ago".'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'What did early peoples carry in pots to preserve fire?' },
                answer: 'charcoal',
                explanation: 'The passage says they carried "charcoal in pots".'
            },
        ]);

        // Lesson 2: Matches History
        await createLesson(client, riLevel, 2, 'The Invention of Matches', 'practice', 20, 30, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Fire-lighting was revolutionised by the discovery of phosphorus, isolated in 1669 by a German alchemist trying to transmute silver into gold. Several 17th century chemists used it to manufacture fire-lighting devices, but the results were dangerously inflammable.\n\nThe first matches resembling those used today were made in 1827 by John Walker, an English pharmacist who borrowed the formula from a military rocket-maker called Congreve. Walker never patented his invention, and three years later it was copied by Samuel Jones, who marketed his product as "Lucifers".\n\nAbout the same time, Charles Sauria produced the first "strike-anywhere" match by substituting white phosphorus for potassium chlorate. However, since white phosphorus is a deadly poison, from 1845 match-makers exposed to its fumes succumbed to necrosis, a disease that eats away jaw-bones. It wasn\'t until 1906 that the substance was eventually banned.',
                    question: 'Why was phosphorus originally discovered?',
                    options: ['To make matches', 'During an attempt to turn silver into gold', 'To create a new medicine', 'By accident during a chemistry experiment']
                },
                answer: 'During an attempt to turn silver into gold',
                explanation: 'The passage says phosphorus was "isolated in 1669 by a German alchemist trying to transmute silver into gold".'
            },
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match each person to their contribution:',
                    items: ['John Walker', 'Samuel Jones', 'Charles Sauria', 'Congreve'],
                    options: ['Made first modern-looking matches', 'Marketed copies as "Lucifers"', 'Created first strike-anywhere match', 'Military rocket-maker whose formula was borrowed']
                },
                answer: ['Made first modern-looking matches', 'Marketed copies as "Lucifers"', 'Created first strike-anywhere match', 'Military rocket-maker whose formula was borrowed'],
                explanation: 'Each inventor made a specific contribution to match development.'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'John Walker patented his match invention.' },
                answer: 'false',
                explanation: '"Walker never patented his invention".'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'White phosphorus caused a disease called ___ that destroyed jaw-bones.' },
                answer: 'necrosis',
                explanation: 'The passage identifies the disease as necrosis.'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'In what year was white phosphorus finally banned?' },
                answer: '1906',
                explanation: '"It wasn\'t until 1906 that the substance was eventually banned."'
            },
        ]);

        // Lesson 3: Zoo Conservation
        await createLesson(client, riLevel, 3, 'Zoo Conservation Programmes', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Zoos were originally created as places of entertainment, and their suggested involvement with conservation didn\'t seriously arise until about 30 years ago, when the Zoological Society of London held the first formal international meeting on the subject. Eight years later, a series of world conferences took place, entitled "The Breeding of Endangered Species", and from this point onwards conservation became the zoo community\'s buzzword.\n\nThe World Zoo Conservation Strategy (WZCS) estimates that there are about 10,000 zoos in the world, of which around 1,000 represent a core of quality collections capable of participating in co-ordinated conservation programmes. This is probably the document\'s first failing, as 10,000 is likely a serious underestimate of the total number of places masquerading as zoological establishments.\n\nToday approximately 16 species might be said to have been "saved" by captive breeding programmes, although a number of these can hardly be looked upon as resounding successes. Given that the international conference was held 30 years ago, this is pretty slow progress.',
                    question: 'What was the original purpose of zoos?',
                    options: ['Conservation', 'Scientific research', 'Entertainment', 'Education']
                },
                answer: 'Entertainment',
                explanation: 'The passage states "Zoos were originally created as places of entertainment".'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'The WZCS believes there are about 10,000 zoos worldwide.' },
                answer: 'true',
                explanation: 'The WZCS "estimates that there are about 10,000 zoos in the world".'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'The writer thinks the WZCS estimate of 10,000 zoos is too high.' },
                answer: 'false',
                explanation: 'The writer says "10,000 is likely a serious underestimate".'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'How many species have been saved by captive breeding?',
                    options: ['About 16', 'About 1,000', 'About 2,000', 'About 30']
                },
                answer: 'About 16',
                explanation: '"Today approximately 16 species might be said to have been saved."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Conservation became the zoo community\'s ___ after the world conferences.' },
                answer: 'buzzword',
                explanation: 'The passage says "conservation became the zoo community\'s buzzword".'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'All 16 species saved by captive breeding are considered great successes.' },
                answer: 'false',
                explanation: 'The passage says "a number of these can hardly be looked upon as resounding successes".'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // READING — UPPER INTERMEDIATE (Band 6–7)
        // ═══════════════════════════════════════════════════════════

        const ruLevel = levels.reading.upper_intermediate;

        await createLesson(client, ruLevel, 1, 'Heading Matching: Architecture', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'A. Humans have always built upwards. The pyramids of Egypt, the Gothic cathedrals of medieval Europe, and the skyscrapers of modern cities all reflect our desire to reach for the sky. But what drives this ambition? For some, it is a statement of power and prestige. For others, it is a practical response to limited land.\n\nB. The first true skyscrapers appeared in Chicago in the 1880s, made possible by two key innovations: the steel frame and the safety elevator. Before steel frames, buildings relied on thick load-bearing walls that limited height. The elevator, perfected by Elisha Otis in 1857, made upper floors accessible and desirable.\n\nC. Modern skyscrapers face unique engineering challenges. Wind forces increase dramatically with height, requiring sophisticated damping systems. The Taipei 101 tower, for example, uses a 730-tonne steel pendulum to counteract wind sway. Foundation engineering is equally critical — the Burj Khalifa\'s foundation extends 50 metres below ground.\n\nD. Critics argue that skyscrapers create wind tunnels at street level, block sunlight, and contribute to urban isolation. Supporters counter that dense vertical development is more environmentally sustainable than suburban sprawl, reducing transport emissions and preserving green spaces.',
                    question: 'Which paragraph discusses the negative effects of tall buildings?',
                    options: ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D']
                },
                answer: 'Paragraph D',
                explanation: 'Paragraph D discusses criticisms: wind tunnels, blocked sunlight, and urban isolation.'
            },
            {
                type: 'matching', points: 4,
                question: {
                    question: 'Match each paragraph (A–D) to its best heading:',
                    items: ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D'],
                    options: ['The human desire to build high', 'The birth of the skyscraper', 'Engineering solutions for tall structures', 'The debate over vertical cities']
                },
                answer: ['The human desire to build high', 'The birth of the skyscraper', 'Engineering solutions for tall structures', 'The debate over vertical cities'],
                explanation: 'Each paragraph has a distinct theme that matches its heading.'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Before steel frames, buildings relied on thick ___-bearing walls.' },
                answer: 'load',
                explanation: 'The passage mentions "load-bearing walls".'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'What device does Taipei 101 use to counteract wind sway?' },
                answer: 'steel pendulum',
                explanation: 'The passage mentions a "730-tonne steel pendulum".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'Supporters of skyscrapers argue they are less environmentally sustainable than suburban development.' },
                answer: 'false',
                explanation: 'Supporters say vertical development is MORE sustainable than suburban sprawl.'
            },
        ]);

        await createLesson(client, ruLevel, 2, 'Summary Completion: Language Research', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'The Spoken Corpus project at the University of Nottingham has been collecting samples of everyday English conversation for over a decade. Unlike written language, spoken English is full of incomplete sentences, false starts, repetitions, and fillers such as "um" and "er". Researchers discovered that spoken grammar often differs significantly from written grammar.\n\nOne surprising finding was that speakers rarely use the passive voice in conversation. While academic practice frequently employs constructions like "the experiment was conducted", everyday speech prefers active forms: "we did the experiment". Similarly, spoken English makes far greater use of vague language — expressions like "sort of", "kind of", and "stuff like that" appear constantly.\n\nThe researchers also found that certain words are far more common in speech than in practice. The word "just" appears in spoken English roughly 15 times more frequently than in written texts. Modal verbs like "would" and "could" are also used differently — in speech, they often serve as hedging devices rather than indicating conditionality.',
                    question: 'What is surprising about the passive voice in spoken English?',
                    options: ['It is used more than in practice', 'It is rarely used', 'It is used incorrectly', 'It is only used formally']
                },
                answer: 'It is rarely used',
                explanation: '"Speakers rarely use the passive voice in conversation."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Spoken English contains many incomplete sentences, false starts, repetitions, and ___ such as "um" and "er".' },
                answer: 'fillers',
                explanation: 'The passage identifies these as "fillers".'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'How many times more frequently does the word "just" appear in spoken versus written English?' },
                answer: '15',
                explanation: '"The word \'just\' appears in spoken English roughly 15 times more frequently."'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'In conversation, modal verbs like "would" are mainly used to express conditions.' },
                answer: 'false',
                explanation: 'In speech they "often serve as hedging devices rather than indicating conditionality".'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'What type of language do speakers use frequently in conversation?',
                    options: ['Technical language', 'Vague language', 'Formal language', 'Legal language']
                },
                answer: 'Vague language',
                explanation: '"Spoken English makes far greater use of vague language."'
            },
        ]);

        await createLesson(client, ruLevel, 3, 'Yes/No/Not Given: Tourism', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'The sociologist John Urry argues that tourism is fundamentally about the "gaze" — the way tourists look at and experience places. He suggests that tourism transforms everyday locations into objects of visual consumption. A beach, a mountain, or a historic building becomes something to be photographed, shared, and collected as a memory.\n\nUrry identifies two types of tourist gaze: the "romantic gaze", where tourists seek solitude and an authentic connection with nature or culture, and the "collective gaze", where the presence of other people is part of the experience — think of festivals, busy markets, or sports events.\n\nCritics of modern tourism argue that the tourist gaze commodifies culture, turning genuine traditions into performances for paying audiences. However, others suggest that tourism can preserve cultural practices that might otherwise disappear, providing economic incentives for communities to maintain their heritage.',
                    question: 'According to Urry, what is tourism fundamentally about?',
                    options: ['Economic development', 'The way tourists look at and experience places', 'Preserving cultural heritage', 'International travel']
                },
                answer: 'The way tourists look at and experience places',
                explanation: 'Urry argues tourism is "fundamentally about the \'gaze\' — the way tourists look at and experience places".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'The "romantic gaze" involves seeking out large crowds.' },
                answer: 'false',
                explanation: 'The romantic gaze involves "solitude and an authentic connection", not crowds.'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'Urry believes tourism is always harmful to culture.' },
                answer: 'not given',
                explanation: 'The passage presents both views — critics say it commodifies culture, but the passage does not attribute a definitive negative view to Urry himself.'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'Sports events are an example of the collective gaze.' },
                answer: 'true',
                explanation: '"The collective gaze, where the presence of other people is part of the experience — think of festivals, busy markets, or sports events."'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'What positive effect of tourism is mentioned?',
                    options: ['It creates new traditions', 'It reduces travel costs', 'It can preserve cultural practices', 'It replaces old customs']
                },
                answer: 'It can preserve cultural practices',
                explanation: '"Tourism can preserve cultural practices that might otherwise disappear."'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // READING — ADVANCED (Band 7.5–9)
        // ═══════════════════════════════════════════════════════════

        const raLevel = levels.reading.advanced;

        await createLesson(client, raLevel, 1, 'Complex Arguments: Biodiversity', 'practice', 25, 40, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'The prevailing view among conservation biologists is that maintaining biodiversity is essential for ecosystem resilience. This perspective, rooted in the "insurance hypothesis", posits that species-rich ecosystems are better buffered against environmental perturbations because different species respond differently to the same disturbance.\n\nHowever, this view has been challenged by those who argue that what matters is not the number of species per se, but the presence of key functional groups. A forest with 200 tree species might function no differently from one with 50 if both contain the same range of functional traits — deep-rooted and shallow-rooted trees, nitrogen-fixers, fast growers and slow growers.\n\nA more nuanced position holds that redundancy within functional groups provides the real insurance value. If a disease eliminates one nitrogen-fixing species, the ecosystem can continue functioning if another nitrogen-fixer remains. It is this "response diversity" — the variety of responses within a functional group — that underpins resilience.',
                    question: 'What does the "insurance hypothesis" suggest?',
                    options: [
                        'Species-rich ecosystems recover faster from disturbances',
                        'All species respond identically to environmental changes',
                        'Functional groups are more important than species numbers',
                        'Redundancy within ecosystems is unnecessary'
                    ]
                },
                answer: 'Species-rich ecosystems recover faster from disturbances',
                explanation: 'The insurance hypothesis says species-rich ecosystems "are better buffered against environmental perturbations".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'According to the challenger view, a forest with 200 species always functions better than one with 50.' },
                answer: 'false',
                explanation: 'The challenger view says a forest with 200 species "might function no differently from one with 50" if both have the same functional traits.'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The variety of responses within a functional group is called "response ___".' },
                answer: 'diversity',
                explanation: 'The passage introduces the term "response diversity".'
            },
            {
                type: 'short_answer', points: 4,
                question: { question: 'What example does the passage give of a functional trait in trees?' },
                answer: 'nitrogen-fixing',
                explanation: 'The passage mentions "nitrogen-fixers" as an example of functional traits, along with deep-rooted trees and fast/slow growers.', 
            },
            {
                type: 'multiple_choice', points: 4,
                question: {
                    question: 'What is the "more nuanced position" described in the passage?',
                    options: [
                        'All species are equally important',
                        'Redundancy within functional groups provides insurance',
                        'Species numbers are the only thing that matters',
                        'Conservation is unnecessary for ecosystem function'
                    ]
                },
                answer: 'Redundancy within functional groups provides insurance',
                explanation: 'The third position says "redundancy within functional groups provides the real insurance value".'
            },
        ]);

        await createLesson(client, raLevel, 2, 'Inference Tasks: Glass Technology', 'practice', 25, 40, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'Glass is one of humanity\'s oldest and most versatile materials. The earliest known glass objects, dating from around 3500 BC, were beads found in Egypt and Mesopotamia. For millennia, glass remained a luxury item — the Roman historian Pliny recorded that a glass drinking vessel cost more than a gold one.\n\nThe transformation of glass from a craft material to an industrial one came with the invention of the float glass process by Alastair Pilkington in 1959. By floating molten glass on a bath of liquid tin, Pilkington produced perfectly flat glass of uniform thickness — something previously impossible to achieve at scale. This single innovation made large plate glass windows economically viable, fundamentally changing modern architecture.\n\nToday, glass technology is advancing rapidly. Self-cleaning glass, coated with titanium dioxide, uses ultraviolet light to break down organic dirt. Electrochromic glass can switch from transparent to opaque at the touch of a button. Perhaps most remarkably, researchers are developing glass that can generate electricity — transparent solar cells that could turn every window into a power source.',
                    question: 'What can be inferred about glass before the float glass process?',
                    options: [
                        'Large flat glass panes were easy to manufacture',
                        'Glass was only used for decorative purposes',
                        'Producing uniform flat glass at scale was very difficult',
                        'Glass was cheaper than metal'
                    ]
                },
                answer: 'Producing uniform flat glass at scale was very difficult',
                explanation: 'The passage says Pilkington produced "perfectly flat glass of uniform thickness — something previously impossible to achieve at scale".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'In ancient Rome, gold vessels were more expensive than glass ones.' },
                answer: 'false',
                explanation: 'Pliny recorded that "a glass drinking vessel cost more than a gold one".'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Self-cleaning glass uses ___ light to break down organic dirt.' },
                answer: 'ultraviolet',
                explanation: 'The passage states it uses "ultraviolet light".'
            },
            {
                type: 'short_answer', points: 4,
                question: { question: 'What material does the float glass process use as a bed for molten glass?' },
                answer: 'liquid tin',
                explanation: '"floating molten glass on a bath of liquid tin".'
            },
            {
                type: 'multiple_choice', points: 4,
                question: {
                    question: 'What potential application of glass technology is described as the most remarkable?',
                    options: [
                        'Self-cleaning windows',
                        'Glass that switches between transparent and opaque',
                        'Windows that generate electricity',
                        'Glass made from recycled materials'
                    ]
                },
                answer: 'Windows that generate electricity',
                explanation: '"Perhaps most remarkably, researchers are developing glass that can generate electricity."'
            },
        ]);

        await createLesson(client, raLevel, 3, 'Synthesis: Conservation Debate', 'practice', 25, 40, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'In-situ conservation (protecting species in their natural habitats) is generally regarded as preferable to ex-situ conservation (maintaining species in zoos or gene banks). The reasoning is straightforward: ecosystems are complex webs of interaction, and removing a species from its habitat severs the relationships that define its ecological role.\n\nYet in-situ conservation faces formidable challenges. Habitat destruction continues at an alarming rate — an estimated 10 million hectares of tropical forest are lost annually. Climate change is shifting habitats faster than many species can migrate. Political instability in biodiversity hotspots makes sustained protection difficult.\n\nThis has led some biologists to advocate a "both/and" approach. Captive breeding programmes serve as a safety net while in-situ efforts address the root causes of decline. The California condor, reduced to just 22 individuals in 1987, was saved by a controversial decision to capture all remaining wild birds for captive breeding. Today, over 500 condors exist, with most living in the wild.\n\nThe condor case illustrates both the potential and limitations of ex-situ conservation. Without captive breeding, the species would almost certainly be extinct. Yet the programme cost over $35 million and required decades of work — resources that critics argue could have protected thousands of hectares of habitat, benefiting hundreds of species simultaneously.',
                    question: 'Why is in-situ conservation generally preferred?',
                    options: [
                        'It is cheaper than captive breeding',
                        'It preserves the ecological relationships of species',
                        'It requires less scientific expertise',
                        'It always produces better results'
                    ]
                },
                answer: 'It preserves the ecological relationships of species',
                explanation: 'The passage says removing a species "severs the relationships that define its ecological role".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'All biologists agree that in-situ conservation is always better than ex-situ.' },
                answer: 'false',
                explanation: 'Some biologists advocate a "both/and" approach, recognizing limitations of both.'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'How many California condors existed in 1987?' },
                answer: '22',
                explanation: 'The condor was "reduced to just 22 individuals in 1987".'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'An estimated ___ million hectares of tropical forest are lost each year.' },
                answer: '10',
                explanation: '"An estimated 10 million hectares of tropical forest are lost annually."'
            },
            {
                type: 'multiple_choice', points: 4,
                question: {
                    question: 'What argument do critics make about the condor programme?',
                    options: [
                        'The condor should have been allowed to go extinct',
                        'The money could have been better spent protecting habitat',
                        'Captive breeding never works',
                        'The wild population is still too small'
                    ]
                },
                answer: 'The money could have been better spent protecting habitat',
                explanation: 'Critics argue the resources "could have protected thousands of hectares of habitat, benefiting hundreds of species simultaneously".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'The California condor breeding programme cost over $35 million.' },
                answer: 'true',
                explanation: '"The programme cost over $35 million."'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // LISTENING — INTERMEDIATE
        // ═══════════════════════════════════════════════════════════

        const liLevel = levels.listening.intermediate;

        await createLesson(client, liLevel, 1, 'Form Completion: Lost Property', 'practice', 15, 25, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Transcript excerpt:\nOfficer: "So, can you describe the item you\'ve lost?"\nWoman: "Yes, it\'s a black leather briefcase with silver buckles. I had some important papers inside, a few pens, and a novel I was reading."\nOfficer: "And where exactly were you when you lost it?"\nWoman: "I was standing near the taxi rank, just outside the main entrance of the station."\nOfficer: "And what time was this?"\nWoman: "It must have been about quarter past nine."',
                    question: 'What material is the briefcase made of?',
                    options: ['Canvas', 'Black leather', 'Brown leather', 'Nylon']
                },
                answer: 'Black leather',
                explanation: 'The woman describes it as "a black leather briefcase".'
            },
            {
                type: 'fill_blank', points: 2,
                question: { question: 'The briefcase has silver ___ as a distinguishing feature.' },
                answer: 'buckles',
                explanation: 'She describes it as having "silver buckles".'
            },
            {
                type: 'multiple_choice', points: 2,
                question: {
                    question: 'What was NOT inside the briefcase?',
                    options: ['Papers', 'A wallet', 'Pens', 'A novel']
                },
                answer: 'A wallet',
                explanation: 'She mentioned papers, pens, and a novel — not a wallet.'
            },
            {
                type: 'short_answer', points: 2,
                question: { question: 'Where was the woman standing when she lost the briefcase?' },
                answer: 'near the taxi rank',
                explanation: '"I was standing near the taxi rank, just outside the main entrance."'
            },
            {
                type: 'fill_blank', points: 2,
                question: { question: 'She lost her briefcase at about quarter past ___.' },
                answer: 'nine',
                explanation: '"It must have been about quarter past nine."'
            },
        ]);

        await createLesson(client, liLevel, 2, 'Multiple Choice: News Report', 'practice', 15, 25, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'News Report Transcript:\n"The Government has announced plans to give $4.5 million to assist drought-affected farmers. This money was originally earmarked for improving Sydney\'s transport system but has now been re-allocated due to the severity of the drought — Australia\'s worst in over fifty years. However, farming groups have criticised the package, saying the amount is simply not enough to make a difference."',
                    question: 'How much money has the Government allocated to help farmers?',
                    options: ['$4 million', '$4.5 million', '$5 million', '$45 million']
                },
                answer: '$4.5 million',
                explanation: '"The Government has announced plans to give $4.5 million."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The money was originally meant for improving Sydney\'s ___ system.' },
                answer: 'transport',
                explanation: '"Originally earmarked for improving Sydney\'s transport system."'
            },
            {
                type: 'true_false_ng', points: 2,
                question: { question: 'Farming groups are satisfied with the financial package.' },
                answer: 'false',
                explanation: 'Farming groups "criticised the package, saying the amount is simply not enough".'
            },
            {
                type: 'short_answer', points: 2,
                question: { question: 'How long has it been since Australia experienced a drought this severe?' },
                answer: 'fifty years',
                explanation: '"Australia\'s worst in over fifty years."'
            },
        ]);

        await createLesson(client, liLevel, 3, 'Note Completion: University Orientation', 'practice', 15, 30, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Orientation Talk Transcript:\n"Welcome to the School of Economics. I\'m Dr. Rawson, and I\'ll be your course supervisor. Attendance at lectures is closely monitored — we expect you to attend all sessions. Tutorials take place three mornings a week, and you\'ll be required to present a tutorial paper: that means you\'ll research a given topic, present it for 25 minutes, then hand a written copy to the lecturer for marking.\n\nFor your essay, the topic is usually connected to your tutorial topic. The exam is a three-hour written paper. Important books are kept in the reserve collection of the library. The focus of this course is on 19th and 20th century economic history."',
                    question: 'What is the lecturer\'s name?',
                    options: ['Roberts', 'Rawson', 'Rogers', 'Robertson']
                },
                answer: 'Rawson',
                explanation: '"I\'m Dr. Rawson."'
            },
            {
                type: 'fill_blank', points: 2,
                question: { question: 'Students must present their tutorial paper for ___ minutes.' },
                answer: '25',
                explanation: '"Present it for 25 minutes."'
            },
            {
                type: 'multiple_choice', points: 2,
                question: {
                    question: 'How is attendance at lectures managed?',
                    options: ['It is optional', 'It is closely monitored', 'It is not tracked', 'It is only required for exams']
                },
                answer: 'It is closely monitored',
                explanation: '"Attendance at lectures is closely monitored."'
            },
            {
                type: 'fill_blank', points: 2,
                question: { question: 'Important books are kept in the ___ collection of the library.' },
                answer: 'reserve',
                explanation: '"Important books are kept in the reserve collection."'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'What type of exam is used for this course?' },
                answer: 'three-hour written paper',
                explanation: '"The exam is a three-hour written paper."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The course focuses on ___ and 20th century economic history.' },
                answer: '19th',
                explanation: '"The focus of this course is on 19th and 20th century economic history."'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // LISTENING — UPPER INTERMEDIATE
        // ═══════════════════════════════════════════════════════════

        const luLevel = levels.listening.upper_intermediate;

        await createLesson(client, luLevel, 1, 'Lecture: Faculty Structure', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Lecture Transcript:\n"I work within the Faculty of Arts and Social Sciences. The Faculty consists firstly of departments — we have Psychology, Sociology, Political Science, and History. In your first semester, you\'ll take courses in psychology, sociology, political science, and statistics. Students often have problems with statistics and with time management, so please don\'t hesitate to seek help early on."',
                    question: 'The speaker works within which Faculty?',
                    options: ['Science and Technology', 'Arts and Social Sciences', 'Architecture', 'Law']
                },
                answer: 'Arts and Social Sciences',
                explanation: '"I work within the Faculty of Arts and Social Sciences."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The Faculty consists firstly of ___.' },
                answer: 'departments',
                explanation: '"The Faculty consists firstly of departments."'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'Which subject do students often have problems with?',
                    options: ['Psychology', 'Sociology', 'Statistics', 'History']
                },
                answer: 'Statistics',
                explanation: '"Students often have problems with statistics and with time management."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The second common problem for students is ___ management.' },
                answer: 'time',
                explanation: '"Problems with statistics and with time management."'
            },
        ]);

        await createLesson(client, luLevel, 2, 'Discussion: Plagiarism & Academic Writing', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Academic Skills Talk:\n"A tutorial provides a chance to share views with other students. It\'s not just a small lecture — it\'s interactive. When practising essays, I advise you to research your work well and always name the books you have read. This is called referencing.\n\nI must stress that plagiarism — presenting someone else\'s work as your own — is a serious offence. The university treats it very seriously and penalties can include failing the course or even expulsion. If you\'re unsure about how to reference properly, please ask."',
                    question: 'According to the speaker, a tutorial is:',
                    options: ['A type of lecture', 'Less important than a lecture', 'A chance to share views', 'An alternative to group work']
                },
                answer: 'A chance to share views',
                explanation: '"A tutorial provides a chance to share views with other students."'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'The speaker considers plagiarism to be a minor concern.' },
                answer: 'false',
                explanation: '"Plagiarism — presenting someone else\'s work as your own — is a serious offence."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Presenting someone else\'s work as your own is called ___.' },
                answer: 'plagiarism',
                explanation: 'The speaker defines plagiarism clearly.'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'What does the speaker advise students to do when practice essays?',
                    options: ['Share work with friends', 'Avoid using other writers\' ideas', 'Research well and name sources', 'Write from memory only']
                },
                answer: 'Research well and name sources',
                explanation: '"Research your work well and always name the books you have read."'
            },
        ]);

        await createLesson(client, luLevel, 3, 'Summary: Environmental Discussion', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 3,
                question: {
                    passage: 'Panel Discussion Transcript:\n"Dr. Lee: The key issue is that we\'re losing topsoil at a rate that far exceeds natural regeneration. In the American Midwest, it takes roughly 500 years to produce one inch of topsoil, but intensive farming can lose that in a single decade.\n\nDr. Patel: That\'s right. And the problem is compounded by monoculture — growing the same crop year after year depletes specific nutrients. Cover cropping and crop rotation are proven solutions, but they require farmers to accept lower short-term yields.\n\nDr. Lee: The economic pressures are real. Global food demand is projected to increase by 70% by 2050. We need to find ways to increase production while restoring soil health — and that probably means a fundamental rethink of agricultural subsidies."',
                    question: 'How long does it take to produce one inch of topsoil naturally in the American Midwest?',
                    options: ['50 years', '100 years', '500 years', '1000 years']
                },
                answer: '500 years',
                explanation: '"It takes roughly 500 years to produce one inch of topsoil."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Growing the same crop year after year is called ___.' },
                answer: 'monoculture',
                explanation: '"The problem is compounded by monoculture."'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'By what percentage is global food demand expected to increase by 2050?' },
                answer: '70%',
                explanation: '"Global food demand is projected to increase by 70% by 2050."'
            },
            {
                type: 'multiple_choice', points: 3,
                question: {
                    question: 'What solutions does Dr. Patel mention for soil depletion?',
                    options: [
                        'Using more chemical fertilisers',
                        'Cover cropping and crop rotation',
                        'Reducing all farming activity',
                        'Importing topsoil from other regions'
                    ]
                },
                answer: 'Cover cropping and crop rotation',
                explanation: '"Cover cropping and crop rotation are proven solutions."'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // WRITING — INTERMEDIATE
        // ═══════════════════════════════════════════════════════════

        const wiLevel = levels.writing.intermediate;

        await createLesson(client, wiLevel, 1, 'IELTS Letter Writing', 'practice', 20, 30, [
            {
                type: 'essay_prompt', points: 8,
                question: {
                    topic: 'You recently bought a product online and it arrived damaged. Write a letter to the company. In your letter:\n- describe what you ordered\n- explain the problem\n- say what you would like them to do\n\nWrite at least 150 words.',
                    modelAnswer: 'Dear Sir or Madam,\n\nI am writing to complain about a product I recently purchased from your online store. On 15th February, I ordered a ceramic table lamp (Order No. 4827), which was delivered on 20th February.\n\nUnfortunately, when I opened the package, I discovered that the lampshade was cracked and the base had a large chip on one side. It appears that the item was not adequately packed, as there was very little protective material inside the box.\n\nI would appreciate it if you could either send a replacement lamp or issue a full refund to my original payment method. I have kept the damaged item and the original packaging should you need them for inspection.\n\nI look forward to hearing from you within the next seven days.\n\nYours faithfully,\nJohn Smith'
                },
                answer: null,
                explanation: 'A good complaint letter is polite but firm, describes the problem clearly, and states what action you want.'
            },
            mc('Which greeting is correct for a formal letter when you don\'t know the person\'s name?',
                ['Dear John,', 'Hi there,', 'Dear Sir or Madam,', 'Hey,'],
                'Dear Sir or Madam,', 3,
                'Use "Dear Sir or Madam" when the recipient\'s name is unknown.'),
            mc('If you begin with "Dear Sir or Madam", how should you end the letter?',
                ['Yours sincerely', 'Yours faithfully', 'Best wishes', 'Cheers'],
                'Yours faithfully', 3,
                '"Yours faithfully" pairs with "Dear Sir or Madam" in formal letters.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these parts of a formal complaint letter in order:',
                    items: ['State what action you want', 'Describe the product you bought', 'Formal greeting', 'Explain the problem', 'Formal sign-off']
                },
                answer: ['Formal greeting', 'Describe the product you bought', 'Explain the problem', 'State what action you want', 'Formal sign-off'],
                explanation: 'Complaint letters follow a logical structure.'
            },
        ]);

        await createLesson(client, wiLevel, 2, 'Graph Description: Task 1', 'practice', 20, 30, [
            {
                type: 'essay_prompt', points: 8,
                question: {
                    topic: 'The table below shows the percentage of adults in five countries who used the internet in 2005 and 2015.\n\n| Country | 2005 | 2015 |\n|---------|------|------|\n| Sweden | 85% | 95% |\n| USA | 68% | 87% |\n| Japan | 66% | 91% |\n| Brazil | 21% | 59% |\n| India | 5% | 26% |\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
                    modelAnswer: 'The table compares internet usage among adults in five countries between 2005 and 2015.\n\nOverall, internet use increased in all five countries over the ten-year period, with the most dramatic growth seen in developing nations. Sweden had the highest percentage of internet users throughout, while India had the lowest.\n\nIn 2005, Sweden led with 85% of adults online, followed by the USA (68%) and Japan (66%). Brazil had a significantly lower figure at 21%, while India had only 5% of adults using the internet.\n\nBy 2015, all countries had seen substantial increases. Sweden reached 95%, Japan rose sharply to 91%, and the USA grew to 87%. The most notable growth occurred in Brazil, which nearly tripled from 21% to 59%. India also saw significant growth, increasing fivefold to 26%, although it remained the lowest of the five countries.\n\nIn conclusion, while developed nations maintained higher internet usage rates, developing countries experienced faster rates of growth.'
                },
                answer: null,
                explanation: 'A Task 1 report should include an overview, compare data, and use appropriate language for describing trends.'
            },
            mc('Which phrase is best for introducing an overview?',
                ['"I think that..."', '"Overall, ..."', '"In my opinion..."', '"Firstly..."'],
                '"Overall, ..."', 3,
                '"Overall" is the standard way to introduce a general summary in Task 1.'),
            mc('Which verb accurately describes a change from 21% to 59%?',
                ['Decreased', 'Remained stable', 'Nearly tripled', 'Halved'],
                'Nearly tripled', 3,
                '21% × 3 = 63%, so 59% is close to tripling.'),
        ]);

        await createLesson(client, wiLevel, 3, 'Opinion Essay: Task 2', 'practice', 25, 35, [
            {
                type: 'essay_prompt', points: 10,
                question: {
                    topic: 'Some people believe that children should begin learning a foreign language at primary school. Others believe that children should begin at secondary school.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 250 words.',
                    modelAnswer: 'There is ongoing debate about the optimal age to begin foreign language instruction. While some advocate starting in primary school, others prefer secondary school. This essay will examine both perspectives before presenting my own view.\n\nThose who favour early language learning point to research showing that young children are more adept at acquiring pronunciation and intonation patterns. The "critical period hypothesis" suggests that the brain is most receptive to new languages before puberty. Additionally, starting early gives students more years of exposure, potentially leading to higher levels of fluency.\n\nOn the other hand, proponents of later introduction argue that secondary school students have more developed cognitive abilities, enabling them to understand complex grammar rules. They also suggest that primary school curricula are already crowded and that adding languages could detract from core subjects like literacy and numeracy.\n\nIn my opinion, the benefits of early language learning outweigh the drawbacks. While it is true that primary curricula are busy, even modest exposure to a foreign language at a young age can build a foundation that accelerates later learning. The key is to use age-appropriate methods — songs, games, and stories rather than grammar drills.\n\nIn conclusion, although both approaches have merit, I believe that beginning foreign language education in primary school, using engaging and playful methods, gives children the best chance of achieving competence.'
                },
                answer: null,
                explanation: 'A strong Task 2 essay discusses both sides, gives a clear opinion, and uses paragraphing effectively.'
            },
            mc('In a "discuss both views" essay, you should:',
                ['Only present your opinion', 'Present both views then give your opinion', 'Avoid giving your opinion', 'Only present facts'],
                'Present both views then give your opinion', 3,
                'The prompt asks you to discuss BOTH views AND give your opinion.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these essay paragraphs in order:',
                    items: ['Your opinion paragraph', 'Introduction + thesis', 'View 2 (against)', 'Conclusion', 'View 1 (for)']
                },
                answer: ['Introduction + thesis', 'View 1 (for)', 'View 2 (against)', 'Your opinion paragraph', 'Conclusion'],
                explanation: 'A well-structured discussion essay follows this logical flow.'
            },
        ]);

        // ═══════════════════════════════════════════════════════════
        // SPEAKING — INTERMEDIATE
        // ═══════════════════════════════════════════════════════════

        const siLevel = levels.speaking.intermediate;

        await createLesson(client, siLevel, 1, 'Part 1: Work & Study', 'practice', 15, 25, [
            {
                type: 'speaking_prompt', points: 5,
                question: {
                    question: 'Answer the following Part 1 questions (1-2 minutes total):\n1. Do you work or are you a student?\n2. What do you like about your work/studies?\n3. What would you change about your job/course if you could?\n4. Do you think you will continue in this field in the future?',
                    prepTime: 15,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Part 1 answers should be 2-3 sentences each. Extend your answers with reasons and examples.'
            },
            mc('Which Part 1 answer is best?',
                ['"Yes."', '"I work."', '"Yes, I work as an accountant for a small firm in the city centre, which I find quite rewarding."', '"Work is good."'],
                '"Yes, I work as an accountant for a small firm in the city centre, which I find quite rewarding."', 3,
                'Good Part 1 answers give specific details and personal views.'),
            tf('In Part 1, you should speak for 3-4 minutes per question.', 'false', 2,
                'Part 1 answers should be brief — about 2-3 sentences each.'),
        ]);

        await createLesson(client, siLevel, 2, 'Part 2: Describe a Place', 'practice', 15, 30, [
            {
                type: 'speaking_prompt', points: 8,
                question: {
                    question: 'Cue Card:\nDescribe a place you have visited that you particularly liked.\n\nYou should say:\n- where it is\n- when you went there\n- what you did there\n- and explain why you liked it.\n\nYou have 1 minute to prepare. Then speak for 1-2 minutes.',
                    prepTime: 60,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Use your preparation time to make brief notes. Cover all bullet points and extend with personal feelings and vivid descriptions.'
            },
            mc('How long do you have to prepare for Part 2?',
                ['30 seconds', '1 minute', '2 minutes', '5 minutes'],
                '1 minute', 2,
                'You get exactly 1 minute of preparation time for the cue card.'),
            {
                type: 'ordering', points: 4,
                question: {
                    question: 'Put these strategies for Part 2 in order of priority:',
                    items: ['Add personal feelings and opinions', 'Cover all bullet points', 'Use descriptive vocabulary', 'Make brief notes during prep time']
                },
                answer: ['Make brief notes during prep time', 'Cover all bullet points', 'Use descriptive vocabulary', 'Add personal feelings and opinions'],
                explanation: 'Start with structure (notes + bullet points), then enhance with language and personality.'
            },
        ]);

        await createLesson(client, siLevel, 3, 'Part 3: Abstract Discussion', 'practice', 15, 30, [
            {
                type: 'speaking_prompt', points: 8,
                question: {
                    question: 'Part 3 Discussion Questions (following a Part 2 about "a place you visited"):\n\n1. Why do you think people like to travel to different places?\n2. Do you think tourism has a positive or negative impact on local communities?\n3. How has technology changed the way people travel?\n4. Do you think international travel will increase or decrease in the future? Why?',
                    prepTime: 15,
                    speakTime: 180
                },
                answer: null,
                explanation: 'Part 3 requires longer, more developed answers with reasons, examples, and balanced views.'
            },
            mc('How do Part 3 questions differ from Part 1?',
                ['They are easier', 'They are more abstract and require longer answers', 'They are about your personal life', 'They require one-word answers'],
                'They are more abstract and require longer answers', 3,
                'Part 3 tests your ability to discuss abstract ideas and give extended, analytical responses.'),
            mc('Which phrase is useful for giving a balanced answer?',
                ['"I think yes."', '"On one hand... on the other hand..."', '"Obviously..."', '"Everyone knows..."'],
                '"On one hand... on the other hand..."', 3,
                'This phrase shows you can consider multiple perspectives.'),
        ]);

        // ═══════════════════════════════════════════════════════════
        // Remaining UPPER-INTERMEDIATE and ADVANCED for Writing & Speaking
        // ═══════════════════════════════════════════════════════════

        // WRITING UPPER-INTERMEDIATE
        const wuLevel = levels.writing.upper_intermediate;

        await createLesson(client, wuLevel, 1, 'Task 1: Process Diagram', 'practice', 20, 35, [
            {
                type: 'essay_prompt', points: 10,
                question: {
                    topic: 'The diagram below shows the process of making chocolate from cacao beans.\n\nSteps: Cacao pods harvested → Beans removed and fermented (5-7 days) → Beans dried in the sun → Beans roasted at 130°C → Shells removed (winnowing) → Inner nibs ground into cocoa liquor → Cocoa liquor pressed to separate cocoa butter and cocoa powder → Ingredients mixed (cocoa liquor + cocoa butter + sugar + milk) → Mixture refined and conched (heated and mixed for hours) → Tempered and moulded into bars\n\nSummarise the information by selecting and reporting the main features. Write at least 150 words.',
                    modelAnswer: 'The diagram illustrates the ten-stage process by which chocolate is manufactured from cacao beans.\n\nThe process begins with the harvesting of cacao pods, after which the beans are extracted and left to ferment for a period of five to seven days. Following fermentation, the beans are dried in the sun before being roasted at a temperature of 130 degrees Celsius.\n\nOnce roasted, the outer shells are removed through a process called winnowing, leaving the inner nibs. These nibs are then ground to produce cocoa liquor, which is subsequently pressed to separate it into two components: cocoa butter and cocoa powder.\n\nIn the final stages, the cocoa liquor is combined with cocoa butter, sugar, and milk. This mixture undergoes refining and conching — a process involving prolonged heating and mixing — before being tempered and poured into moulds to form chocolate bars.\n\nOverall, the production of chocolate is a complex, multi-stage process that transforms raw cacao beans through both physical and chemical processes.'
                },
                answer: null,
                explanation: 'Process descriptions should use passive voice, sequencing language, and describe each stage clearly.'
            },
            mc('Which voice is most appropriate for describing a process?',
                ['Active voice ("Workers harvest the pods")', 'Passive voice ("The pods are harvested")', 'Both are equally correct', 'Neither — use commands'],
                'Passive voice ("The pods are harvested")', 3,
                'Process descriptions in IELTS typically use the passive voice.'),
        ]);

        await createLesson(client, wuLevel, 2, 'Task 2: Problem-Solution Essay', 'practice', 25, 40, [
            {
                type: 'essay_prompt', points: 10,
                question: {
                    topic: 'In many cities, the increasing number of cars is causing serious problems for residents. What are these problems and what solutions can you suggest?\n\nWrite at least 250 words.',
                    modelAnswer: 'The rapid growth in car ownership in urban areas has led to a range of significant problems that affect the daily lives of city residents. This essay will examine the main issues and propose practical solutions.\n\nThe most obvious problem is traffic congestion. In many major cities, commuters spend hours in gridlocked traffic, leading to lost productivity and increased stress. A related issue is air pollution — vehicle emissions contribute significantly to poor air quality, which has been linked to respiratory diseases and other health problems. Furthermore, the demand for parking spaces has consumed valuable urban land that could be used for housing, parks, or community facilities.\n\nSeveral solutions could address these challenges. Firstly, governments should invest heavily in public transport systems, making buses, trams, and trains more affordable, reliable, and extensive. When public transport is convenient, people are less likely to drive. Secondly, congestion pricing — charging drivers to enter busy city centres — has proven effective in cities like London and Singapore. This both reduces traffic and generates revenue for transport improvements. Finally, city planners should promote cycling and walking by building dedicated lanes and pedestrianised zones.\n\nIn conclusion, while the problems caused by excessive car use are serious, they are not insurmountable. A combination of improved public transport, congestion pricing, and better urban planning can significantly reduce the negative impact of cars on city life.'
                },
                answer: null,
                explanation: 'Problem-solution essays should clearly identify 2-3 problems, propose practical solutions, and conclude with a summary.'
            },
            mc('Which is the best way to introduce a solution?',
                ['"I think maybe..."', '"One effective solution would be to..."', '"Someone should..."', '"It\'s easy to..."'],
                '"One effective solution would be to..."', 3,
                'This structure is clear, formal, and confident.'),
        ]);

        await createLesson(client, wuLevel, 3, 'Task 2: Agree/Disagree Essay', 'practice', 25, 40, [
            {
                type: 'essay_prompt', points: 10,
                question: {
                    topic: '"Universities should accept equal numbers of male and female students in every subject."\n\nTo what extent do you agree or disagree?\n\nWrite at least 250 words.',
                    modelAnswer: 'Some people argue that university admissions should enforce gender parity across all subjects. While I understand the intention behind this proposal, I believe that enforcing strict quotas would be counterproductive.\n\nProponents of equal gender representation argue that it would help break down traditional stereotypes. If equal numbers of men and women studied engineering or nursing, it might encourage future generations to pursue their interests without gender-based expectations. Additionally, diverse perspectives within a field often lead to more creative problem-solving.\n\nHowever, I believe that university places should be awarded on merit rather than gender. Imposing quotas could mean rejecting better-qualified candidates simply because they are the wrong gender, which is itself a form of discrimination. Moreover, the root causes of gender imbalances lie in earlier education and societal attitudes, not in university admissions policies.\n\nA more effective approach would be to address gender stereotypes in schools, provide role models in underrepresented fields, and ensure that no structural barriers prevent either gender from applying. This tackles the underlying problem rather than merely treating the symptom.\n\nIn conclusion, while gender balance in higher education is a worthy goal, I disagree that strict quotas are the right approach. Instead, efforts should focus on creating equal opportunities from an early age, allowing students to choose their path freely.'
                },
                answer: null,
                explanation: 'Agree/disagree essays need a clear position stated in the introduction and maintained throughout.'
            },
            mc('In an "agree or disagree" essay, when should you state your opinion?',
                ['Only in the conclusion', 'In the introduction and reinforce in the conclusion', 'Never — remain neutral', 'Only in body paragraphs'],
                'In the introduction and reinforce in the conclusion', 3,
                'Your position should be clear from the start and consistent throughout.'),
        ]);

        // SPEAKING UPPER-INTERMEDIATE & ADVANCED
        const suLevel = levels.speaking.upper_intermediate;

        await createLesson(client, suLevel, 1, 'Extended Part 2: Describe an Achievement', 'practice', 20, 30, [
            {
                type: 'speaking_prompt', points: 8,
                question: {
                    question: 'Cue Card:\nDescribe something you did that was successful.\n\nYou should say:\n- what it was\n- when you did it\n- how you prepared for it\n- and explain why you consider it successful.\n\nSpeak for 1-2 minutes.',
                    prepTime: 60,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Use narrative tenses (past simple, past continuous, past perfect) and include feelings and reflections.'
            },
            mc('Which tense combination works best for telling a story?',
                ['Only present tense', 'Past simple + past continuous for background', 'Only future tense', 'Present perfect only'],
                'Past simple + past continuous for background', 3,
                '"I was studying for my exam when I suddenly realised..." combines both tenses effectively.'),
            fb('"I was absolutely ___ when I got the results." Complete with a strong adjective (e.g., thrilled, delighted, ecstatic).', 'thrilled', 3,
                'Strong adjectives show vocabulary range in IELTS Speaking.'),
        ]);

        await createLesson(client, suLevel, 2, 'Part 3: Education & Technology', 'practice', 20, 35, [
            {
                type: 'speaking_prompt', points: 10,
                question: {
                    question: 'Part 3 Discussion:\n1. How has technology changed education in your country?\n2. Do you think online learning can replace traditional classrooms? Why or why not?\n3. What are the advantages and disadvantages of children using technology from a young age?\n4. How might education change in the next 20 years?',
                    prepTime: 15,
                    speakTime: 240
                },
                answer: null,
                explanation: 'Give developed answers with specific examples. Use hedging language for predictions ("It\'s likely that...", "I would imagine...").'
            },
            mc('Which phrase is best for speculating about the future?',
                ['"It will definitely..."', '"I\'m not sure, but I would imagine that..."', '"Everyone knows..."', '"Obviously..."'],
                '"I\'m not sure, but I would imagine that..."', 3,
                'Hedging shows sophistication and intellectual honesty.'),
        ]);

        await createLesson(client, suLevel, 3, 'Part 3: Society & Change', 'practice', 20, 35, [
            {
                type: 'speaking_prompt', points: 10,
                question: {
                    question: 'Part 3 Discussion:\n1. In what ways has life changed in your country compared to 50 years ago?\n2. Do you think these changes are mostly positive or negative?\n3. What role should governments play in managing social change?\n4. Is it possible for a society to modernise without losing its cultural identity?',
                    prepTime: 15,
                    speakTime: 240
                },
                answer: null,
                explanation: 'For abstract topics, use compare/contrast structures and provide balanced viewpoints before giving your opinion.'
            },
            mc('Which phrase best introduces a contrasting point?',
                ['"And also..."', '"Having said that..."', '"Similarly..."', '"Therefore..."'],
                '"Having said that..."', 3,
                '"Having said that" signals a contrasting point after an initial statement.'),
        ]);

        // LISTENING & SPEAKING ADVANCED — Additional depth
        const laLevel = levels.listening.advanced;

        await createLesson(client, laLevel, 1, 'Academic Lecture: Research Methods', 'practice', 25, 40, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'Lecture on Research Methods:\n"The distinction between qualitative and quantitative research is fundamental. Quantitative research uses numerical data and statistical analysis to test hypotheses. Qualitative research, by contrast, explores meanings, experiences, and perspectives through methods like interviews and observations.\n\nHowever, this binary division is increasingly seen as simplistic. Mixed-methods research combines both approaches, using quantitative data to establish patterns and qualitative data to explain why those patterns exist. For example, a survey might reveal that 60% of students prefer online learning, but interviews can explore the reasons behind that preference — perhaps flexibility, or anxiety about face-to-face interaction.\n\nThe key challenge in mixed-methods research is integration — ensuring that the quantitative and qualitative components genuinely inform each other rather than existing as parallel but disconnected studies."',
                    question: 'What is the main challenge of mixed-methods research according to the lecture?',
                    options: [
                        'Collecting enough data',
                        'Choosing the right participants',
                        'Integrating quantitative and qualitative components',
                        'Publishing the results'
                    ]
                },
                answer: 'Integrating quantitative and qualitative components',
                explanation: '"The key challenge in mixed-methods research is integration."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Qualitative research explores meanings, experiences, and perspectives through methods like interviews and ___.' },
                answer: 'observations',
                explanation: 'The lecture mentions "interviews and observations".'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'The lecture suggests that the division between qualitative and quantitative research is always clear-cut.' },
                answer: 'false',
                explanation: '"This binary division is increasingly seen as simplistic."'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'What percentage of students preferred online learning in the survey example?' },
                answer: '60%',
                explanation: '"A survey might reveal that 60% of students prefer online learning."'
            },
        ]);

        await createLesson(client, laLevel, 2, 'Complex Dialogue: Academic Advising', 'practice', 20, 35, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'Academic Advising Dialogue:\nAdvisor: "So your thesis proposal on urban green spaces — I like the concept, but your methodology needs work. You\'re proposing to survey 50 residents. That\'s a reasonable sample for qualitative work, but if you want to make statistically significant claims, you\'ll need at least 200."\n\nStudent: "I was thinking of using a mixed approach — surveys for the quantitative data and then in-depth interviews with 10-15 residents who have gardens adjacent to green spaces."\n\nAdvisor: "That\'s much better. But be careful about selection bias in your interview participants. You need a clear rationale for who you choose and why. Also, have you considered the seasonal factor? People\'s use of green spaces varies enormously between summer and winter."',
                    question: 'Why does the advisor think 50 residents is insufficient?',
                    options: [
                        'It costs too much',
                        'It takes too long to survey',
                        'It\'s too small for statistically significant claims',
                        'Qualitative research doesn\'t use surveys'
                    ]
                },
                answer: 'It\'s too small for statistically significant claims',
                explanation: '"If you want to make statistically significant claims, you\'ll need at least 200."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'The advisor warns the student about selection ___ in choosing interview participants.' },
                answer: 'bias',
                explanation: '"Be careful about selection bias."'
            },
            {
                type: 'short_answer', points: 3,
                question: { question: 'What environmental factor does the advisor mention that affects green space use?' },
                answer: 'seasonal',
                explanation: '"Have you considered the seasonal factor?"'
            },
        ]);

        await createLesson(client, laLevel, 3, 'Inference: Panel on AI Ethics', 'practice', 25, 40, [
            {
                type: 'multiple_choice', points: 4,
                question: {
                    passage: 'AI Ethics Panel:\nDr. Chen: "The fundamental problem with AI decision-making in healthcare isn\'t accuracy — many systems outperform human doctors in diagnostic tasks. The problem is accountability. When an AI system misdiagnoses a patient, who is responsible? The developer? The hospital? The doctor who relied on it?"\n\nProf. Williams: "I\'d add that there\'s a transparency issue. Many AI systems are \'black boxes\' — even their creators can\'t fully explain how they reach decisions. This is particularly troubling in medicine, where a doctor needs to understand and justify the reasoning behind a diagnosis."\n\nDr. Chen: "Exactly. And there\'s a deeper philosophical question: should we deploy a system that is statistically more accurate than a human doctor but whose reasoning we cannot understand? The utilitarian answer is yes — more lives saved. But that conflicts with principles of informed consent and patient autonomy."',
                    question: 'According to Dr. Chen, what is the fundamental problem with AI in healthcare?',
                    options: [
                        'AI systems are not accurate enough',
                        'Accountability when AI makes errors',
                        'AI is too expensive for hospitals',
                        'Patients refuse AI treatment'
                    ]
                },
                answer: 'Accountability when AI makes errors',
                explanation: '"The fundamental problem isn\'t accuracy... The problem is accountability."'
            },
            {
                type: 'fill_blank', points: 3,
                question: { question: 'Prof. Williams describes many AI systems as "___ boxes" because their reasoning cannot be explained.' },
                answer: 'black',
                explanation: '"Many AI systems are \'black boxes\'."'
            },
            {
                type: 'multiple_choice', points: 4,
                question: {
                    question: 'What philosophical tension does Dr. Chen identify?',
                    options: [
                        'Cost vs. quality',
                        'Speed vs. accuracy',
                        'Utilitarian benefit vs. principles of informed consent',
                        'Innovation vs. tradition'
                    ]
                },
                answer: 'Utilitarian benefit vs. principles of informed consent',
                explanation: '"The utilitarian answer is yes — more lives saved. But that conflicts with principles of informed consent."'
            },
            {
                type: 'true_false_ng', points: 3,
                question: { question: 'Prof. Williams believes AI systems should never be used in medicine.' },
                answer: 'not given',
                explanation: 'Prof. Williams raises concerns about transparency but doesn\'t say AI should never be used.'
            },
        ]);

        // WRITING & SPEAKING ADVANCED
        const waLevel = levels.writing.advanced;

        await createLesson(client, waLevel, 1, 'Academic Report: Comparing Data', 'practice', 25, 40, [
            {
                type: 'essay_prompt', points: 12,
                question: {
                    topic: 'The charts below show the proportion of energy generated from renewable sources in four countries in 2000 and 2020.\n\n2000: Norway 65%, Brazil 38%, Germany 5%, China 2%\n2020: Norway 72%, Brazil 45%, Germany 35%, China 28%\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
                    modelAnswer: 'The data compares the share of renewable energy production in Norway, Brazil, Germany, and China in 2000 and 2020.\n\nOverall, all four countries increased their renewable energy output over the 20-year period, with the most dramatic growth occurring in Germany and China.\n\nIn 2000, Norway generated by far the highest proportion of its energy from renewables, at 65%, largely due to its extensive hydropower infrastructure. Brazil was the second highest at 38%. By contrast, Germany and China had minimal renewable contributions, at just 5% and 2% respectively.\n\nBy 2020, Norway had modestly increased to 72%, maintaining its position as the leader. Brazil also grew steadily to 45%. However, the most striking changes were seen in Germany and China. Germany\'s renewable share rose sevenfold to 35%, reflecting its Energiewende policy. China saw the largest absolute growth, rising from 2% to 28%, driven by massive investment in solar and wind power.\n\nIn summary, while Scandinavian and South American countries maintained established leads, European and Asian nations made the most significant progress in adopting renewable energy sources.'
                },
                answer: null,
                explanation: 'High-band Task 1 responses use precise comparisons, avoid repetition, and include an insightful overview.'
            },
        ]);

        await createLesson(client, waLevel, 2, 'Discursive Essay: Globalisation', 'practice', 30, 45, [
            {
                type: 'essay_prompt', points: 12,
                question: {
                    topic: '"Globalisation has brought more benefits than drawbacks to the world."\n\nTo what extent do you agree or disagree with this statement?\n\nWrite at least 250 words. Support your arguments with specific examples.',
                    modelAnswer: 'Globalisation — the increasing interconnectedness of economies, cultures, and populations — is one of the defining phenomena of the modern era. While it has undeniably created enormous wealth and opportunity, I believe that its benefits have been unevenly distributed, making a simple assessment of "more benefits than drawbacks" problematic.\n\nThe economic advantages of globalisation are well-documented. International trade has lifted hundreds of millions out of poverty, particularly in East Asia. The free flow of information and technology has accelerated innovation, while cultural exchange has broadened horizons and fostered mutual understanding between peoples.\n\nHowever, globalisation has also created significant challenges. The outsourcing of manufacturing to low-wage countries has devastated communities in developed nations, contributing to political polarisation. Environmental degradation has accelerated as global supply chains prioritise cost over sustainability. Furthermore, while multinational corporations have benefited enormously, wealth has become increasingly concentrated, with the gap between rich and poor widening both within and between nations.\n\nPerhaps the most nuanced criticism is that globalisation has eroded local cultures and identities. The global spread of Western consumer culture, while embraced by many, has displaced traditional practices and languages at an alarming rate.\n\nIn conclusion, while I acknowledge the substantial benefits of globalisation, I believe that its drawbacks are equally significant and cannot be ignored. The challenge for policymakers is not to reverse globalisation but to manage it more equitably, ensuring that its benefits are shared more broadly and its costs mitigated more effectively.'
                },
                answer: null,
                explanation: 'Band 8-9 essays demonstrate sophisticated vocabulary, nuanced argumentation, and precise grammar throughout.'
            },
        ]);

        await createLesson(client, waLevel, 3, 'Evaluative Essay: Technology & Privacy', 'practice', 30, 45, [
            {
                type: 'essay_prompt', points: 12,
                question: {
                    topic: '"The widespread use of surveillance technology makes society safer, and people should be willing to give up some privacy for greater security."\n\nTo what extent do you agree or disagree?\n\nWrite at least 250 words. Consider evidence from real-world examples.',
                    modelAnswer: 'The tension between security and privacy is one of the most pressing debates of the digital age. While surveillance technology has undoubtedly helped prevent crime and terrorism, I largely disagree with the premise that citizens should passively accept the erosion of their privacy.\n\nAdvocates of surveillance point to tangible results. CCTV networks have helped solve crimes and deter antisocial behaviour. Facial recognition technology has identified suspects in crowds. Intelligence agencies argue that mass data collection has prevented terrorist attacks — though the classified nature of this evidence makes independent verification difficult.\n\nNevertheless, there are compelling reasons to resist the normalisation of surveillance. Historical evidence demonstrates that surveillance powers, once granted, tend to expand rather than contract. The Snowden revelations showed that intelligence agencies had far exceeded their mandated scope. In authoritarian regimes, surveillance technology is routinely used to suppress political dissent and minority groups — a chilling reminder that the tools of protection can easily become instruments of oppression.\n\nMoreover, the assumption that "if you have nothing to hide, you have nothing to fear" fundamentally misunderstands the value of privacy. Privacy is not about concealment; it is about autonomy — the freedom to think, associate, and express oneself without being watched and judged.\n\nIn conclusion, while targeted, proportionate surveillance has a legitimate role in maintaining public safety, blanket surveillance represents a disproportionate intrusion on civil liberties. A society that sacrifices privacy for security risks losing both.'
                },
                answer: null,
                explanation: 'Top-band essays engage critically with the question, use real examples, and demonstrate clear logical reasoning.'
            },
        ]);

        // SPEAKING ADVANCED
        const saLevel = levels.speaking.advanced;

        await createLesson(client, saLevel, 1, 'Complex Cue Card: Hypothetical Scenario', 'practice', 20, 40, [
            {
                type: 'speaking_prompt', points: 10,
                question: {
                    question: 'Cue Card:\nDescribe a situation where you had to make a difficult decision.\n\nYou should say:\n- what the situation was\n- what options you had\n- what you decided to do\n- and explain whether you think you made the right decision.\n\nSpeak for 2 minutes.',
                    prepTime: 60,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Use conditional and perfect tenses naturally: "Had I known...", "Looking back, I might have..."'
            },
            mc('Which structure shows advanced grammar for reflection?',
                ['"I decided to go."', '"Had I known the outcome, I might have chosen differently."', '"I chose this one."', '"It was good."'],
                '"Had I known the outcome, I might have chosen differently."', 4,
                'Third conditional + inversion demonstrates high-level grammatical control.'),
        ]);

        await createLesson(client, saLevel, 2, 'Part 3: Philosophical Discussion', 'practice', 25, 45, [
            {
                type: 'speaking_prompt', points: 12,
                question: {
                    question: 'Part 3 Questions:\n1. Do you think happiness is something people can learn, or is it innate?\n2. To what extent should governments be responsible for their citizens\' wellbeing?\n3. Some people argue that material wealth is necessary for happiness. Do you agree?\n4. How do cultural values influence what people consider a "good life"?',
                    prepTime: 15,
                    speakTime: 300
                },
                answer: null,
                explanation: 'For Band 8+, demonstrate sophisticated vocabulary, idiomatic language, and the ability to explore abstract concepts from multiple angles.'
            },
            mc('Which response shows the highest level of spoken English?',
                [
                    '"I think money is important."',
                    '"It depends on what you mean by happiness — if we\'re talking about life satisfaction versus moment-to-moment pleasure, the relationship with wealth is quite different."',
                    '"Happiness is good."',
                    '"Everyone wants to be happy."'
                ],
                '"It depends on what you mean by happiness — if we\'re talking about life satisfaction versus moment-to-moment pleasure, the relationship with wealth is quite different."', 4,
                'This answer defines terms, makes distinctions, and demonstrates analytical thinking.'),
        ]);

        await createLesson(client, saLevel, 3, 'Full Mock Interview', 'practice', 30, 50, [
            {
                type: 'speaking_prompt', points: 5,
                question: {
                    question: 'PART 1 (4-5 minutes):\nAnswer these questions naturally:\n1. What area do you live in?\n2. What do you like about it?\n3. Do you read much? What kind of things?\n4. Do you prefer reading paper books or e-books? Why?',
                    prepTime: 0,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Part 1: Give concise but extended answers. Don\'t overthink.'
            },
            {
                type: 'speaking_prompt', points: 10,
                question: {
                    question: 'PART 2 (3-4 minutes):\nDescribe a time when you helped someone.\n\nYou should say:\n- who you helped\n- what the situation was\n- what you did\n- and explain how you felt about helping this person.\n\n1 minute preparation, then speak for 2 minutes.',
                    prepTime: 60,
                    speakTime: 120
                },
                answer: null,
                explanation: 'Part 2: Tell a complete story with a beginning, middle, and end. Include feelings.'
            },
            {
                type: 'speaking_prompt', points: 10,
                question: {
                    question: 'PART 3 (4-5 minutes):\n1. Is it important for people to help each other in modern society?\n2. Do you think people are more or less willing to help strangers compared to the past?\n3. Should helping others be taught in schools? How?\n4. What motivates people to volunteer — altruism or self-interest?',
                    prepTime: 0,
                    speakTime: 300
                },
                answer: null,
                explanation: 'Part 3: Engage deeply with abstract ideas. Use hedging, exemplification, and balanced arguments.'
            },
        ]);

        await client.query('COMMIT');
        console.log('IELTS seed completed successfully!');
        console.log('Added lessons for all intermediate, upper-intermediate, and advanced levels.');
        console.log('Skills covered: Reading, Listening, Writing, Speaking');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('IELTS seed failed:', err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

// Helper functions
function mc(question, options, answer, points, explanation) {
    return {
        type: 'multiple_choice', points,
        question: { question, options },
        answer, explanation
    };
}

function tf(statement, answer, points, explanation) {
    return {
        type: 'true_false_ng', points,
        question: { question: statement },
        answer, explanation
    };
}

function fb(question, answer, points, explanation) {
    return {
        type: 'fill_blank', points,
        question: { question },
        answer, explanation
    };
}

async function createLesson(client, levelId, orderIndex, title, lessonType, durationMin, xpReward, exercises) {
    const lessonRes = await client.query(
        `INSERT INTO lessons (level_id, title, lesson_type, xp_reward, duration_min, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [levelId, title, lessonType, xpReward, durationMin, orderIndex]
    );
    const lessonId = lessonRes.rows[0].id;

    if (exercises.length > 0) {
        const values = [];
        const params = [];
        let paramIdx = 1;

        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i];
            values.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6})`);
            params.push(lessonId, ex.type, JSON.stringify(ex.question), JSON.stringify(ex.answer), ex.points, i + 1, ex.explanation ?? null);
            paramIdx += 7;
        }

        await client.query(
            `INSERT INTO exercises (lesson_id, exercise_type, question_json, answer_json, points, sort_order, explanation)
             VALUES ${values.join(', ')}`,
            params
        );
    }
    return lessonId;
}

seedIELTS();
