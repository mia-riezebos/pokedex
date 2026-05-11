insert into public.categories (name, slug, position) values
  ('Discussion', 'discussion', 0),
  ('Help & Support', 'help', 1),
  ('Off-topic', 'off-topic', 2)
on conflict (slug) do nothing;

insert into public.subforums (category_id, name, slug, description, position) values
  ((select id from public.categories where slug = 'discussion'),
   'General', 'general', 'Anything Poke-related.', 0),
  ((select id from public.categories where slug = 'discussion'),
   'Tips & Tricks', 'tips', 'Workflows, prompts, and clever uses.', 1),
  ((select id from public.categories where slug = 'help'),
   'Questions', 'questions', 'Ask the community.', 0),
  ((select id from public.categories where slug = 'help'),
   'Bug Reports', 'bugs', 'Issues with Poke (community-tracked, not official).', 1),
  ((select id from public.categories where slug = 'off-topic'),
   'Lounge', 'lounge', 'Anything goes.', 0)
on conflict (slug) do nothing;
