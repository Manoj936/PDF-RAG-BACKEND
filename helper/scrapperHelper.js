import axios from 'axios'; 
import robotsParser from 'robots-parser';

export async function isScrapable(url) {
    return (
      await isUrlReachable(url) &&
      await isHtmlContent(url) &&
      await isAllowedByRobots(url)
    );
  }

  export async function isAllowedByRobots(url){
    try {
      const { hostname, protocol } = new URL(url);
      const robotsUrl = `${protocol}//${hostname}/robots.txt`;
      const robotsText = (await axios.get(robotsUrl)).data;
      const robots = robotsParser(robotsUrl, robotsText);
      return robots.isAllowed(url, '*');
    } catch (error) {
      return true; // Fail-safe: if no robots.txt, assume allowed
    }
  }

  export async function isHtmlContent(url) {
    try {
      const response = await axios.head(url);
      const contentType = response.headers['content-type'];
      return contentType && contentType.includes('text/html');
    } catch (error) {
      return false;
    }
  }

  export async function isUrlReachable(url) {
    try {
      const response = await axios.head(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }