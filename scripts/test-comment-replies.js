const assert = require('assert');

const BASE_URL = 'http://localhost:3000';
const ADMIN_USER_ID = 'u001'; // Amy Antipolo
const RESIDENT_USER_ID = 'uMPNN7FC5'; // Keith Bernard Osabal

async function run() {
  console.log('--- Testing Announcement Comment Replies & Mentions ---');

  // 1. Get an announcement
  const announcementsRes = await fetch(`${BASE_URL}/api/announcements`);
  const announcements = await announcementsRes.json();
  assert(announcements.length > 0, 'Should have announcements');
  const testAnnouncement = announcements[0];
  const announcementId = testAnnouncement.id;
  console.log(`Using announcement: ${announcementId} ("${testAnnouncement.title}")`);

  // 2. Post a root comment
  console.log('1. Posting a root comment...');
  const rootRes = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ADMIN_USER_ID,
    },
    body: JSON.stringify({
      comment: 'Initial announcement comment from Admin',
    }),
  });
  assert.strictEqual(rootRes.status, 201, 'Root comment creation should return 201');
  const rootComment = await rootRes.json();
  console.log('Root comment created:', rootComment.id);
  assert.strictEqual(rootComment.parent_id, null, 'Root comment should have parent_id null');

  // 3. Post a reply to the root comment mentioning Amy Antipolo
  console.log('2. Posting a reply to root comment mentioning Amy Antipolo...');
  const reply1Res = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': RESIDENT_USER_ID,
    },
    body: JSON.stringify({
      comment: '@Amy Antipolo Thank you for this update!',
      parent_id: rootComment.id,
      reply_to_user_id: ADMIN_USER_ID,
    }),
  });
  assert.strictEqual(reply1Res.status, 201, 'Reply 1 creation should return 201');
  const reply1 = await reply1Res.json();
  console.log('Reply 1 created:', reply1.id, 'parent_id:', reply1.parent_id);
  assert.strictEqual(reply1.parent_id, rootComment.id, 'Reply 1 parent_id should match root comment id');
  assert.strictEqual(reply1.reply_to_user_id, ADMIN_USER_ID, 'Reply 1 reply_to_user_id should match Admin');

  // 4. Post a reply to Reply 1 mentioning Keith Bernard Osabal (testing 1-level flattening)
  console.log('3. Posting a reply to Reply 1 (testing 1-level flattening)...');
  const reply2Res = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ADMIN_USER_ID,
    },
    body: JSON.stringify({
      comment: '@Keith Bernard Osabal You are welcome!',
      parent_id: reply1.id, // passing child comment id
      reply_to_user_id: RESIDENT_USER_ID,
    }),
  });
  assert.strictEqual(reply2Res.status, 201, 'Reply 2 creation should return 201');
  const reply2 = await reply2Res.json();
  console.log('Reply 2 created:', reply2.id, 'parent_id:', reply2.parent_id);
  assert.strictEqual(reply2.parent_id, rootComment.id, 'Reply 2 should be flattened to root comment ID (Facebook style)');

  // 5. Fetch all comments for announcement and verify
  console.log('4. Fetching all comments for announcement...');
  const allCommentsRes = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`);
  const allComments = await allCommentsRes.json();
  const fetchedRoot = allComments.find(c => c.id === rootComment.id);
  const fetchedReply1 = allComments.find(c => c.id === reply1.id);
  const fetchedReply2 = allComments.find(c => c.id === reply2.id);

  assert(fetchedRoot, 'Root comment must exist in list');
  assert(fetchedReply1, 'Reply 1 must exist in list');
  assert(fetchedReply2, 'Reply 2 must exist in list');
  assert.strictEqual(fetchedReply1.parent_id, rootComment.id);
  assert.strictEqual(fetchedReply2.parent_id, rootComment.id);
  assert.strictEqual(fetchedReply1.reply_to_name, 'Amy Antipolo');
  console.log('[PASS] Thread hierarchy and reply_to_name verified successfully');

  // 6. Test cascading delete of root comment
  console.log('5. Testing cascading delete of root comment...');
  const deleteRes = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments/${rootComment.id}`, {
    method: 'DELETE',
    headers: {
      'x-user-id': ADMIN_USER_ID,
    },
  });
  assert.strictEqual(deleteRes.status, 200, 'Delete should succeed with 200');

  // Verify that rootComment, reply1, and reply2 are all deleted
  const afterDeleteRes = await fetch(`${BASE_URL}/api/announcements/${announcementId}/comments`);
  const afterDeleteComments = await afterDeleteRes.json();
  const remaining = afterDeleteComments.filter(c => [rootComment.id, reply1.id, reply2.id].includes(c.id));
  assert.strictEqual(remaining.length, 0, 'Root comment and all replies should be deleted via cascading delete');
  console.log('[PASS] Cascading delete verified successfully');

  console.log('\n--- ALL COMMENT REPLIES & MENTIONS TESTS PASSED! ---');
}

run().catch(err => {
  console.error('[FAIL] Test failed:', err);
  process.exit(1);
});
