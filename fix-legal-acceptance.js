const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need to add your service account key)
// admin.initializeApp({
//   credential: admin.credential.applicationDefault(),
//   databaseURL: "your-firebase-database-url"
// });

const db = admin.database();

async function fixLegalAcceptanceData() {
  try {
    console.log('Starting legal acceptance data fix...');
    
    // Get all users
    const usersSnapshot = await db.ref('users').once('value');
    const users = [];
    
    usersSnapshot.forEach(childSnapshot => {
      users.push({
        id: childSnapshot.key,
        ...childSnapshot.val()
      });
    });
    
    console.log(`Found ${users.length} users`);
    
    let fixedCount = 0;
    
    for (const user of users) {
      if (user.legalAcceptance) {
        // Check if updatedAt is missing
        if (!user.legalAcceptance.updatedAt) {
          console.log(`Fixing user ${user.email} (${user.id})`);
          
          // Set updatedAt to the earliest acceptance date or current time
          let updatedAt = new Date().toISOString();
          
          if (user.legalAcceptance.termsOfService?.acceptedAt) {
            updatedAt = user.legalAcceptance.termsOfService.acceptedAt;
          } else if (user.legalAcceptance.privacyPolicy?.acceptedAt) {
            updatedAt = user.legalAcceptance.privacyPolicy.acceptedAt;
          }
          
          // Update the user's legalAcceptance.updatedAt field
          await db.ref(`users/${user.id}/legalAcceptance/updatedAt`).set(updatedAt);
          fixedCount++;
        }
      }
    }
    
    console.log(`Fixed ${fixedCount} users`);
    console.log('Legal acceptance data fix completed!');
    
  } catch (error) {
    console.error('Error fixing legal acceptance data:', error);
  }
}

// Run the fix
fixLegalAcceptanceData();
