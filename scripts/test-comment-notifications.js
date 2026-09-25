const assert = require('assert');

const BASE_URL = 'http://localhost:3000';
const ADMIN_USER_ID = 'u001'; // Amy Antipolo (Admin)
const RESIDENT_USER_ID = 'uMPNN7FC5'; // Keith Bernard Osabal (Homeowner)

async function getNotifications() {
  const res = await fetch(`${BASE_URL}/api/notifications`, {
    headers: { 'x-user-id': ADMIN_USER_ID },
  });
  return await res.json();
}

async function run() {
  console.log('--- Testing Announcement Notifications (Replies, Post Authors & Mentions) ---');

  // 1. Get announcements
  const announcementsRes = await fetch(`${BASE_URL}/api/announcements`);
  const announcements = await announcementsRes.json();
  assert(announcements.length > 0, 'Should have announcements');

  // Find an announcement created by Admin (u001)
  let adminAnnouncement = announcements.find(a => (a.user_id === ADMIN_USER_ID || a.createdBy === ADMIN_USER_ID));
  if (!adminAnnouncement) {
    adminAnnouncement = announcements[0];
  }
  const announcementId = adminAnnouncement.id;
  console.log(`Using announcement: ${announcementId} ("${adminAnnouncement.title}") authored by ${adminAnnouncement.user_id || adminAnnouncement.createdBy}`);

  // 2. Test Post Author Notification: Resident Keith comments on Admin Amy's announcement
  console.log('\n[Test 1] Resident Keith comments on Admin Amy post...');
  const beforeNotifs = await getNotifications();
  const beforeCount = beforeNotifs.length;

  const commentRes1 = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': RESIDENT_USER_ID,
    },
    body: JSON.stringify({
      comment: 'Hello Admin! This is a feedback comment on the announcement.',
    }),
  });
  assert.strictEqual(commentRes1.status, 201, 'Comment 1 should succeed');
  const comment1 = await commentRes1.json();

  // Check notifications for Admin Amy
  const notifsAfter1 = await getNotifications();
  const authorNotif = notifsAfter1.find(n => 
    n.title === 'New Comment on Your Announcement' &&
    n.targetIds.includes(ADMIN_USER_ID)
  );
  assert(authorNotif, 'Admin should receive "New Comment on Your Announcement" notification');
  assert(authorNotif.message.includes('Keith Bernard Osabal'), 'Notification message should name the commenter');
  console.log('[PASS] Post Author notification verified: Admin received notification for resident comment.');

  // 3. Test Comment Reply Notification: Admin Amy replies to Resident Keith's comment
  console.log('\n[Test 2] Admin Amy replies to Resident Keith comment...');
  const commentRes2 = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ADMIN_USER_ID,
    },
    body: JSON.stringify({
      comment: 'Thank you for your feedback, Keith!',
      parent_id: comment1.id,
      reply_to_user_id: RESIDENT_USER_ID,
    }),
  });
  assert.strictEqual(commentRes2.status, 201, 'Reply should succeed');
  const comment2 = await commentRes2.json();

  // Check notifications for Resident Keith
  const notifsAfter2 = await getNotifications();
  const replyNotif = notifsAfter2.find(n => 
    n.title === 'New Reply to Your Comment' &&
    n.targetIds.includes(RESIDENT_USER_ID)
  );
  assert(replyNotif, 'Resident Keith should receive "New Reply to Your Comment" notification');
  assert(replyNotif.message.includes('Amy Antipolo'), 'Notification message should name the replier');
  console.log('[PASS] Comment Reply notification verified: Resident received reply notification.');

  // 4. Test User Mention Notification: Admin Amy mentions Keith in a comment
  console.log('\n[Test 3] User Mention notification...');
  const commentRes3 = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ADMIN_USER_ID,
    },
    body: JSON.stringify({
      comment: 'Calling attention to @Keith Bernard Osabal regarding this notice.',
    }),
  });
  assert.strictEqual(commentRes3.status, 201, 'Mention comment should succeed');
  const comment3 = await commentRes3.json();

  // Check notifications for Mention
  const notifsAfter3 = await getNotifications();
  const mentionNotif = notifsAfter3.find(n => 
    n.title === 'Mentioned in Announcement Comment' &&
    n.targetIds.includes(RESIDENT_USER_ID) &&
    n.message.includes('Calling attention')
  );
  assert(mentionNotif, 'Mentioned user should receive "Mentioned in Announcement Comment" notification');
  assert(mentionNotif.message.includes('Amy Antipolo'), 'Mention notification should name who mentioned them');
  console.log('[PASS] User Mention notification verified: User received mention alert.');

  // 5. Test Self-Exclusion: Admin commenting on own post should NOT generate notification to self
  console.log('\n[Test 4] Self-exclusion check...');
  const notifsBeforeSelf = await getNotifications();
  const adminNotifCountBefore = notifsBeforeSelf.filter(n => n.targetIds.includes(ADMIN_USER_ID)).length;

  const selfCommentRes = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ADMIN_USER_ID,
    },
    body: JSON.stringify({
      comment: 'Admin self note on the post.',
    }),
  });
  assert.strictEqual(selfCommentRes.status, 201);
  const selfComment = await selfCommentRes.json();

  const notifsAfterSelf = await getNotifications();
  const adminNotifCountAfter = notifsAfterSelf.filter(n => n.targetIds.includes(ADMIN_USER_ID)).length;
  assert.strictEqual(adminNotifCountBefore, adminNotifCountAfter, 'Admin commenting on own post should not trigger self-notification');
  console.log('[PASS] Self-exclusion verified: No notification dispatched to self.');

  // Clean up test comments
  console.log('\nCleaning up test comments...');
  for (const c of [comment1, comment2, comment3, selfComment]) {
    await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments/${c.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': ADMIN_USER_ID },
    }).catch(() => {});
  }
  console.log('Cleaned up test comments.');

  console.log('\n--- ALL ANNOUNCEMENT NOTIFICATION TESTS PASSED! ---');
}

run().catch(err => {
  console.error('[FAIL] Test failed:', err);
  process.exit(1);
});
