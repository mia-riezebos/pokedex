import { describe, it, expect, beforeAll } from 'vitest';
import { admin, makeUser, reset } from './helpers';

describe('post triggers', () => {
  let userId: string;
  let userBId: string;
  let subforumId: number;

  beforeAll(async () => {
    await reset();
    const ts = Date.now().toString(36);
    userId = await makeUser(`tt_${ts}_a`);
    userBId = await makeUser(`tt_${ts}_b`);
    const { data } = await admin.from('subforums').select('id').eq('slug', 'general').single();
    if (!data) throw new Error('Seed not loaded — run db:reset first');
    subforumId = data.id;
  });

  it('assigns sequential post_numbers within a thread', async () => {
    const { data: thread } = await admin
      .from('threads')
      .insert({
        subforum_id: subforumId,
        author_id: userId,
        title: 'Sequential test',
        slug: 'seq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      })
      .select()
      .single();

    const { data: p1 } = await admin
      .from('posts')
      .insert({
        thread_id: thread!.id,
        author_id: userId,
        body_md: 'one',
        body_html: '<p>one</p>',
      })
      .select()
      .single();
    const { data: p2 } = await admin
      .from('posts')
      .insert({
        thread_id: thread!.id,
        author_id: userId,
        body_md: 'two',
        body_html: '<p>two</p>',
      })
      .select()
      .single();
    const { data: p3 } = await admin
      .from('posts')
      .insert({
        thread_id: thread!.id,
        author_id: userBId,
        body_md: 'three',
        body_html: '<p>three</p>',
      })
      .select()
      .single();

    expect(p1!.post_number).toBe(1);
    expect(p2!.post_number).toBe(2);
    expect(p3!.post_number).toBe(3);
  });

  it('bumps users.post_count and clears probation at 5 posts', async () => {
    const ts = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const id = await makeUser(`tt_prob_${ts}`);

    const { data: thread } = await admin
      .from('threads')
      .insert({
        subforum_id: subforumId,
        author_id: id,
        title: 'Probation test',
        slug: 'prob-' + ts,
      })
      .select()
      .single();

    for (let i = 0; i < 5; i++) {
      await admin.from('posts').insert({
        thread_id: thread!.id,
        author_id: id,
        body_md: `m${i}`,
        body_html: `<p>${i}</p>`,
      });
    }

    const { data: user } = await admin
      .from('users')
      .select('post_count, is_probationary')
      .eq('id', id)
      .single();
    expect(user!.post_count).toBeGreaterThanOrEqual(5);
    expect(user!.is_probationary).toBe(false);
  });

  it('updates thread.last_post_at + last_post_user_id when reply is posted', async () => {
    const ts = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const { data: thread } = await admin
      .from('threads')
      .insert({
        subforum_id: subforumId,
        author_id: userId,
        title: 'Last post tracker',
        slug: 'lp-' + ts,
      })
      .select()
      .single();

    // OP doesn't bump (post_number=1)
    await admin.from('posts').insert({
      thread_id: thread!.id,
      author_id: userId,
      body_md: 'op',
      body_html: '<p>op</p>',
    });

    // Reply by user B should bump
    await admin.from('posts').insert({
      thread_id: thread!.id,
      author_id: userBId,
      body_md: 'reply',
      body_html: '<p>reply</p>',
    });

    const { data: t } = await admin
      .from('threads')
      .select('post_count, last_post_user_id')
      .eq('id', thread!.id)
      .single();
    expect(t!.post_count).toBe(2);
    expect(t!.last_post_user_id).toBe(userBId);
  });

  it('soft-deletes decrement counters', async () => {
    const ts = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const id = await makeUser(`tt_sd_${ts}`);
    const { data: thread } = await admin
      .from('threads')
      .insert({
        subforum_id: subforumId,
        author_id: id,
        title: 'Soft delete test',
        slug: 'sd-' + ts,
      })
      .select()
      .single();
    await admin.from('posts').insert({
      thread_id: thread!.id,
      author_id: id,
      body_md: 'op',
      body_html: '<p>op</p>',
    });
    const { data: reply } = await admin
      .from('posts')
      .insert({
        thread_id: thread!.id,
        author_id: id,
        body_md: 'reply',
        body_html: '<p>reply</p>',
      })
      .select()
      .single();

    // Initial state: post_count = 2, user.post_count = 2
    let { data: t1 } = await admin.from('threads').select('post_count').eq('id', thread!.id).single();
    let { data: u1 } = await admin.from('users').select('post_count').eq('id', id).single();
    expect(t1!.post_count).toBe(2);
    expect(u1!.post_count).toBe(2);

    // Soft-delete the reply
    await admin.from('posts').update({ is_deleted: true }).eq('id', reply!.id);

    // After: thread.post_count = 1, user.post_count = 1
    let { data: t2 } = await admin.from('threads').select('post_count').eq('id', thread!.id).single();
    let { data: u2 } = await admin.from('users').select('post_count').eq('id', id).single();
    expect(t2!.post_count).toBe(1);
    expect(u2!.post_count).toBe(1);
  });
});
