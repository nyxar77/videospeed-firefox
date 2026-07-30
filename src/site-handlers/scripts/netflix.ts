interface NetflixMessage {
  action?: string;
  seekMs?: number;
}

window.addEventListener(
  'message',
  (event: MessageEvent<NetflixMessage>) => {
    if (
      event.origin !== 'https://www.netflix.com' ||
      event.data.action !== 'videospeed-seek' ||
      !event.data.seekMs
    ) {
      return;
    }
    const netflix = (window as unknown as Window & { netflix: any }).netflix;
    const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
    const playerSessionId = videoPlayer.getAllPlayerSessionIds()[0];
    const currentTime = videoPlayer.getCurrentTimeBySessionId(playerSessionId);
    videoPlayer.getVideoPlayerBySessionId(playerSessionId).seek(currentTime + event.data.seekMs);
  },
  false
);
