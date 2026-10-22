/**
 * Plain-text e-mail templates. Keeping copy out of controllers makes it easy to
 * translate or A/B test messages without touching business rules. SMTP delivery
 * itself is handled by backend/mail.js through an EventEmitter queue.
 */
function requestAccepted({ targetName, place, when }) {
  return {
    subject: "CampusKart: request accepted",
    text: `Your request for "${targetName}" was accepted. Handover at ${place} on ${when}. Show the 4-digit pass from My Orders.`,
  };
}

function requestDeclined({ targetName }) {
  return {
    subject: "CampusKart: request declined",
    text: `Your request for "${targetName}" was declined.`,
  };
}

function requestCountered({ targetName, counter }) {
  return {
    subject: "CampusKart: counter offer",
    text: `The seller countered your offer for "${targetName}" at ${counter}. Open My Orders to accept or decline.`,
  };
}

function handoverRecorded({ billId }) {
  return {
    subject: "CampusKart: handover recorded",
    text: `The handover pass was confirmed. Your bill ${billId} is ready under My Orders.`,
  };
}

module.exports = { requestAccepted, requestDeclined, requestCountered, handoverRecorded };
