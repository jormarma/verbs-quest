-- Seed Verbs Quest Data

-- Level 1 Verbs
INSERT INTO public.verbs (infinitive, past_simple, past_participle, level_group, active) VALUES
('go', 'went', 'gone', 1, true),
('eat', 'ate', 'eaten', 1, true),
('see', 'saw', 'seen', 1, true),
('do', 'did', 'done', 1, true),
('have', 'had', 'had', 1, true);

-- Level 2 Verbs (For future testing)
INSERT INTO public.verbs (infinitive, past_simple, past_participle, level_group, active) VALUES
('make', 'made', 'made', 2, true),
('take', 'took', 'taken', 2, true),
('come', 'came', 'come', 2, true);
