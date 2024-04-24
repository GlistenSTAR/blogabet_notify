let isActive = false;
let intervalId = "";

chrome.commands.onCommand.addListener(async (command) => {
  let tab;
  await chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    tab = tabs[0]
    if (command === "_execute_action") {
      isActive = !isActive
      if (isActive) {
        chrome.action.setBadgeText({ tabId: tab.id, text: "O" });
        await getNewEmail(tab.id)
      } else {
        chrome.action.setBadgeText({ tabId: tab.id, text: "" });
        clearInterval(intervalId)
      }
    }
  })
});

chrome.action.onClicked.addListener(async (tab) => {
  isActive = !isActive
  if (isActive) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "O" });
    await getNewEmail(tab.id)
  } else {
    chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    clearInterval(intervalId)
  }
});

const getNewEmail = async (tabId) => {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: (intervalId) => {
      let old_date;
      const extractUrl = () => {
        let base_xpath = "#MailList > div > div > div > div > div > div > div > div:nth-child(2) > div > div > div > div > div:nth-child(2) > div:nth-child(2)"
        let title = document.querySelector(`${base_xpath} > div:nth-child(1)`).innerText.trim()
        let new_date = document.querySelector(`${base_xpath} > div:nth-child(2) > span`).innerText.trim()
        if (title == "Blogabet") {
          if (new_date != old_date) {
            old_date = new_date;
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            let url = document.querySelector(`${base_xpath} > div:nth-child(3)`).innerText.trim().match(urlRegex)[0]

            // axios.post('http://127.0.0.1:5000/api/blogabet', {
            //   url: url,
            // })
            //   .then(response => {
            //     console.log('send api');
            //   })
            //   .catch(error => {
            //     console.error('Error making Axios POST request:', error);
            //   });

            fetch('http://127.0.0.1:5000/api/blogabet', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                url: url,
              })
            })
              .then(response => response.json())
              .then(data => {
                console.log('send api', data);
              })
              .catch(error => {
                console.error('Error making Fetch POST request:', error);
              });
          }
        }
      }
      intervalId = setInterval(extractUrl, 1000);
    },
    args: [intervalId]
  })
}
