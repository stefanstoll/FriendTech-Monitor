# FriendTech-Monitor
FriendTech monitor that watches for when users join, deposit, and buy their first key.

To Setup:
1) Update client.ts with your HTTP RPC link (line 5) (You can get one for free from [Tenderly](https://tenderly.co/)
2) Add Twitter API keys to monitorHighValue.ts (lines 48-51) (You can get keys from here https://developer.twitter.com/en/portal/dashboard)
3) Add Twitter API keys to monitorLowValue.ts (lines 47-50)
4) Add Discord webhook link to monitorHighValue.ts (line 258) (Sends all notifications to Discord when any activity happens)
5) Add Discord webhook link to monitorLowValue.ts (line 255)
6) Update stateHigh.json and stateLow.json with the latest id of the last user to join FriendTech. You can find this by going to this link: https://prod-api.kosetto.com/users/by-id/194000 => and keep increasing the userID until the website says user not found (line 1)
7) Run "npm install"

Now you have 2 options:
1) npm run monitorHighValue => only sends discord webhook notifications for new users, deposits and buys with 750 followers on Twitter
2) npm run monitorLowValue => sends webhook notifications for all new users, deposits

Feel free to reach out to me @ imstefanstoll@gmail.com if anyone has any questions.
