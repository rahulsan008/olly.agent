import '../img/icon-128.png'
import '../img/icon-34.png'

const enableSidePanelOnActionClick = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('Unable to enable side panel action click behavior:', error);
  }
};

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnActionClick();
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || typeof tab.windowId !== 'number') {
    return;
  }

  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.error('Unable to open side panel:', error);
  });
});
