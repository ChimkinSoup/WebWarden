# High Level Overview
- Chrome extension that enforces a cap on screentime after XYZ number of hours
	- User will have the option of creating a list of blocked websites, and allowing all other websites not mentioned, or creating a list of allowed websites, and blocking all other websites
	- User will then set a time limit for the blocked websites (Ex. 2 hours). This time is universal, so if the user blocks YouTube and Instagram, then spends an hour on YouTube, they are only able to spend an hour on Instagram
		- The time limit resets at 4 AM, although that can be manually changed by the user
	- Once the time allotted runs out:
		- If a user is currently on a blocked website, redirect the user to an internal page packaged in the extension itself 
		- If the user ever tries to access a blocked website, redirect the user to a an internal page
	- The internal page will randomly display either a picture or a quote
		- There will be a preset collection of quotes and pictures which will be displayed by default. The user also has the option of adding quotes or pictures.
		- There will also be a small button in the top right corner which lets the user request more time. The amount of time each request gives is defaulted to 30 min but the user is able to change the amount given
			- This button gives the option to "Restart Now", and if the user restarts their laptop, they are given the extra 30 minutes
- Additional features include a "bedtime" which effectively turns every website into a blocked website after a certain time, but the user also has an option of adding websites to a "productivity" list, where if it is past the bedtime you are still able to gain 30 mins (Or more, depending on the user's settings) just by typing 100 randomized characters exactly (Change the font color to green once a character has been typed, and restart the second the user makes a mistake, so do not allow for deleting previous characters)
	- But for all other apps, there is no "restart now" button and they are permanently blocked until the end of the bedtime
	- There will also be a "hardcore bedtime" toggle which completely disables extra time between certain hours
- There will be another button on the internal page with the restart button, but this will be an emergency pause, which gives the user 10 minutes of extra time, with no friction, but this will only work once a day (Resets at 4 AM), and this can only be used once all the user's blocked time has ended (If the user has multiple groups of apps which are blocked under different categories, this 10 minute allotment can only be used for one category)
# Details
- First time installers are able to adjust the settings freely, but after their first edit, they must BOTH restart their laptop and type in a 100 character randomized string to edit any settings in the future (Although this does NOT count for if they want to add more websites to their block list, which can be done by directly going to settings)
- If the user operates in "Allowlist Mode", provide a set of standard authentication domains to prevent accidental lockouts
- There will be a small toast notification warning the user of 30 minutes, 5 minutes, and 1 minute remaining in their time. Although if the user sets an allotted time of less than 1 hour, then do not send the 30 minute toast notification.
- When the user tries to gain more time during bedtime mode, generate a string of 100 random characters (This includes all symbols and numbers, but no spaces). This must be done in order, with 100% accuracy. This means that if in the middle, they mistype a character, it will reset and generate a new random string of characters
- The restart feature will rely on a companion desktop app (Currently only focusing on Windows), which will communicate with the Chrome extension via Chrome's Native Messaging API
	- The companion app will also store all the user's data. This includes hours logged on which websites, how many restarts they've performed, how many times they hit their time limit, etc
# Theme
- The theme will be dark, with blue accents
- Name of the extension will be WebWarden
# Low Level Design
- Use Manifest V3 with Vanilla JavaScript for the chrome extension. The networking blocking will be handled via the `chrome.declarativeNetRequest` API
	- The extension should redirect any blocked page to a central extension HTML page 
	- The extension stores settings, but they should only be visible and not modifiable unless the appropriate actions are taken (Defined in Details)
	- The extension will maintain a local cache of the user's block list and remaining time (And call on this to check if the user has run out of time)
	- Use `chrome.runtime.connectNative()` to establish a connection between the Chrome extension and the companion app, which should keep the extension running in the background. Add a listener to the `onDisconnect` property of the native messaging port and when it fires, execute a function that calls `chrome.runtime.connectNative()` again to re-establish a connection the companion app if Chrome ever suspends the connection. As a fallback use the `chrome.alarms` API to set a recurring alarm every 1 minutes so that Chrome's alarm manager will temporarily wake up the service worker. Inside of the alarm event check if the native messaging port is active, if not then re-initialize the connection to the companion app.
- The Windows companion should use C++, and it will use the Windows library to determine system uptime
- To track the time elapsed, use a global single boolean state `isConsumingTime`. This ensures that even if multiple tabs are on tracked websites, time will continue to increase linearly
	- Whenever the user switches tabs or changes windows, fire `chrome.tabs.query({ active: true})`. This API call will return an array of the active windows across all currently opened Chrome windows. Then loop through the array and if any of the URLs in the array match the blocked list OR if they have `chrome.tabs.query({ audible: true})` and they are part of the blocked list (Thus the audio is running in the background), immediately set `isConsumingTime = true`, and record the current system time as the start time. The moment the user switches away, closes tabs, or minimizes the browser, the array will return no blocked sites, and then you can set `isConsumingTime = false` and you can calculate the difference between the current time and the starting time and cache the amount of time elapsed. Use `Date.now()` to check the starting and ending time
		- To do this efficiently use `chrome.tabs.onActivated`, `chrome.windows.onFocuseChanged`, and `chrome.tab.onUpdated` as events to listen for and to re-check the array 
		- Use `chrome.idle.onStateChanged` API listener to track the time, and when the state is `locked`, then set `isConsumingTime= false` and deduct the accumulated time up to that point, then when the state returns to `active`, re-evaluate the tabs and start with a fresh timer. Because I want to include idle time, ignore `idle` (Treat it as active)
	- When the array check finds a blocked site and you set `isConsumingTime = true`, calculate how much time the user has left in their pool, then create a specific `chrome.alarms` trigger. If the user switches away from the blocked site before their time runs out, or if `isConsumingTime` is set to false (e.g. The user closes their laptop), then set `isConsumingTime = false`, calculate the difference using `Date.now()`, deduct the time from their local cache, and use `chrome.alarms.clear("timeUp")` to cancel the kill switch. If the user stays on the blocked website and the alarm fires, then instantly set their cached limit to zero, set `isConsumingTime = false`, and redirect them to the central extension HTML page. Use a similar alarm method for the toast alerts, timing them for `remainingTime - 5` (minutes), etc
- Have the chrome extension sync up with the companion app (Extension pushing data onto the companion app) every time `isConsumingTime` is set to `false`
- Include comprehensive unit tests for each module
# Miscellaneous
- Upon startup the extension will check if the user has "Allow In Incognito" on. If the extension does not have permission, block every website that is blocked by default until the user gives permission
	- Same thing will happen if the companion app cannot be reached by the extension