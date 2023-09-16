import axios from 'axios';
import fs from 'fs';
import Twit from 'twit';
const STATE_FILE = './stateLow.json';
import { publicClient } from './client'
import optimizedABI from './optimizedABI.json';
import { parseEther } from 'viem'

// Map to store the previous balances of addresses
const previousBalances: Map<string, bigint> = new Map();

enum ActivityType {
  JOIN,
  DEPOSIT,
  BUY
}

interface TradeLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: bigint;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
  args: {
    trader: string;
    subject: string;
    isBuy: boolean;
    shareAmount: bigint;
    ethAmount: bigint;
    protocolEthAmount: bigint;
    subjectEthAmount: bigint;
    supply: bigint;
  };
  eventName: 'Trade';
}

let matchedUsersList: any[] = [];
const matchedUsersMap: Map<string, any> = new Map(matchedUsersList.map(user => [user.address.toLowerCase(), user]));

// Set up the Twitter client
// YOU CAN GET TWITTER API KEYS FROM THEIR DEVELOPER PORTAL
const T = new Twit({
    consumer_key: 'GET_TWITTER_API_KEY_INFO',
    consumer_secret: 'GET_TWITTER_API_KEY_INFO',
    access_token: 'GET_TWITTER_API_KEY_INFO',
    access_token_secret: 'GET_TWITTER_API_KEY_INFO',
    timeout_ms: 4 * 1000,  // optional HTTP request timeout to apply to all requests.
    strictSSL: true,     // optional - requires SSL certificates to be valid.
});

function pruneMatchedUsersList() {
  if (matchedUsersList.length > 150) {
    const usersToRemove = matchedUsersList.slice(0, matchedUsersList.length / 2);
    for (const user of usersToRemove) {
      previousBalances.delete(user.address);
    }
    matchedUsersList = matchedUsersList.slice(matchedUsersList.length / 2);
  }
}

function getLastUserId() {
  if (fs.existsSync(STATE_FILE)) {
    const data = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(data).lastUserId;
  } else {
    console.error("Error checking state file");
  }
}

function setLastUserId(userId: any) {
    const data = {
        lastUserId: userId
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
}

async function checkUser(userId: any, retryCount: number = 50): Promise<boolean> {
  const url = `https://prod-api.kosetto.com/users/by-id/${userId}`;
  console.log('request link: ' + url);

  while (retryCount > 0) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,  // Set timeout to 5 seconds
      });
      
      // Assuming a user is considered 'found' if response has a twitterUsername
      if (response.data && response.data.twitterUsername) {
        T.get('users/show', { screen_name: response.data.twitterUsername }, (err, data:any, res) => {
          if (data && typeof data.screen_name === 'string' && typeof data.followers_count === 'number') {
            // Construct the desired information
            const userInfo = {
              twitterName: response.data.twitterName,
              twitterUsername: response.data.twitterUsername,
              address: response.data.address.toLowerCase(),
              followersCount: data.followers_count
            };
            console.log(JSON.stringify(userInfo, null, 2)); // Display the formatted data
            matchedUsersList.push(userInfo);
            matchedUsersMap.set(userInfo.address, userInfo);

            sendUserMessage(userInfo, ActivityType.JOIN);
          } else {
            console.error("Unexpected data format or error fetching Twitter data:", err);
          }
        });
        return true;  // User found
      }
    } catch(error: any) {
      // Decrease the retry count
      retryCount--;

      // If the error is a timeout and there are retries left, log and continue the loop
      if (error.code === 'ECONNABORTED' && retryCount > 0) {
        console.log(`Request timed out. Retrying (${retryCount} retries left)...`);
        continue;
      }

      // Check if it's the specific error where user isn't found
      if (error.response && error.response.data && error.response.data.message === "Address/User not found.") {
        console.log('no new users');
        return false;  // User not found
      }

      console.error('API error:', error);
      return false;  // Handle all other errors by returning false
    }
  }

  console.log('Max retries reached. Moving on.');
  return false;
}

async function watchDeposit() {
  const minimumChange = parseEther("0.000015");

  while (true) {
    for (const user of matchedUsersList) {
      try {
        const currentBalance = await publicClient.getBalance({ address: user.address});
        
        const prevBalance = previousBalances.get(user.address);

        // If the balance has changed
        if (prevBalance !== undefined && (currentBalance - prevBalance) >= minimumChange) {
          console.log(`Balance for user ${user.twitterName} (${user.address}) changed from ${prevBalance} to ${currentBalance}.`);
          
          sendUserMessage(user, ActivityType.DEPOSIT);

          // Remove user from matchedUsersList and previousBalances
          const userIndex = matchedUsersList.findIndex(u => u.address == user.address);
          if (userIndex > -1) {
              matchedUsersList.splice(userIndex, 1);
          }
          previousBalances.delete(user.address);
        } else if (prevBalance === undefined) {
          // If this is the first time we're checking this user's balance, simply store it
          previousBalances.set(user.address, currentBalance);
        }
      } catch (error) {
        console.error(`Error checking balance for user ${user.twitterName} (${user.address}):`, error);
      }
    }

    // Wait for a certain period (e.g., 0.1 seconds) before the next iteration
    // Adjust this as necessary
    await new Promise(res => setTimeout(res, 100));
  }
}

async function watchBuy() {
  try {
    publicClient.watchContractEvent({
      address: '0xCF205808Ed36593aa40a44F10c7f7C2F67d4A4d4',
      abi: optimizedABI,
      eventName: 'Trade',
      onLogs: async (rawLogs) => {
        const logs = rawLogs as unknown as TradeLog[];
        const filteredLogs = logs.filter(log => 
          log.args.trader === log.args.subject &&
          log.args.isBuy === true &&
          log.args.ethAmount === 0n
        );
        if (filteredLogs.length > 0) {
          for (const targetLog of filteredLogs) {
            const user = matchedUsersMap.get(targetLog.args.subject.toLowerCase());
            if (user) {
              console.log('found a match', user.address);
              sendUserMessage(user, ActivityType.BUY);
          
              // Remove the user from the matchedUsersMap
              matchedUsersMap.delete(user.address.toLowerCase());
            }     
          }
        }
      }
    });
  } catch (error) {
    watchBuy()
  }
}

async function sendUserMessage(matchedUser: any, activityType: ActivityType) {
  const twitterLink = `https://twitter.com/${matchedUser.twitterUsername}`;
  const baseScanLink = `https://basescan.org/address/${matchedUser.address}`;
  const buyNowLink = `https://friend.tech/rooms/${matchedUser.address}`;
  const formattedFollowersCount = matchedUser.followersCount.toLocaleString();
  
  let title: string;
  let color: number;

  switch (activityType) {
    case ActivityType.JOIN:
      title = "New User Joined!";
      color = 0x4CAF50;  // Green
      break;
    case ActivityType.DEPOSIT:
      title = "Deposit Detected!";
      color = 0x2196F3;  // Blue
      break;
    case ActivityType.BUY:
      title = "Buy Detected!";
      color = 0xFF0000;  // Alarm Red
      break;
    default:
      title = "Unknown Activity";
      color = 0xFF0000;  // Red for error/unexpected
      break;
  }

  const embed = {
    title: title,
    fields: [
      { name: "Name", value: matchedUser.twitterName, inline: true },
      { name: "Twitter", value: `[@${matchedUser.twitterUsername}](${twitterLink})`, inline: true },
      { name: "`Follower`s", value: formattedFollowersCount, inline: true },
      { name: "Address", value: `[${matchedUser.address}](${baseScanLink})`, inline: false },  // This line was modified
      { name: "Buy Now", value: `[FriendTech](${buyNowLink})`, inline: false }
    ],
    color: color,
    footer: {
      text: "Activity detected at",
    },
    timestamp: new Date().toISOString()
  };

  sendMessage({ embeds: [embed] });
}

async function sendMessage(content: any) {
    const DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_HERE';
    try {
      await axios.post(DISCORD_WEBHOOK_URL, content);
  } catch (error) {
      console.error("Error sending message to Discord:", error);
  }
}

async function main() {
  watchDeposit();
  watchBuy();
  let userId = getLastUserId();
  let userExists;

  setInterval(pruneMatchedUsersList, 30 * 60 * 1000); // Check every 30 minutes

  while (true) { // Keep running indefinitely
    userExists = await checkUser(userId);
    if (userExists) {
      userId++;  // Only increment if a user exists
      setLastUserId(userId);
    } else {
      // When no new user is found, take a 8-second break before trying the same userId again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main();