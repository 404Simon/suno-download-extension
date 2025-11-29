(function () {
  "use strict";

  function waitForPlaybar() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const playbar = document.querySelector(
          ".relative.h-auto.md\\:min-h-21.bg-background-secondary",
        );
        if (playbar) {
          clearInterval(checkInterval);
          resolve(playbar);
        }
      }, 500);
    });
  }

  async function getAudioUrl() {
    const audioElement = document.querySelector("#active-audio-play");

    if (!audioElement) {
      console.error("Audio element not found");
      return null;
    }

    if (audioElement.src) {
      return audioElement.src;
    }

    // if no src, trigger play-pause
    const playButton = document.querySelector(
      'button[aria-label="Playbar: Play button"]',
    );

    if (!playButton) {
      console.error("Play button not found");
      return null;
    }

    playButton.click();

    await new Promise((resolve) => setTimeout(resolve, 200));

    const audioUrl = audioElement.src;

    if (audioElement && !audioElement.paused) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    return audioUrl;
  }

  function getSongInfo() {
    const titleElement = document.querySelector(
      'a[aria-label*="Playbar: Title for"]',
    );
    const artistElement = document.querySelector(
      'a[aria-label*="Playbar: Artist for"]',
    );

    let title = "Unknown_Title";
    if (titleElement) {
      const ariaLabel = titleElement.getAttribute("aria-label");
      if (ariaLabel) {
        const match = ariaLabel.match(/Playbar: Title for (.+)/);
        if (match && match[1]) {
          title = match[1].trim();
        }
      }
    }

    const artist = artistElement
      ? artistElement.textContent.trim()
      : "Unknown_Artist";

    return { title, artist };
  }

  function getDetailedMetadata() {
    const metadata = {
      title: "",
      artist: "",
      album: "",
      track_num: "",
      track_total: "",
      disc_num: "",
      disc_total: "",
      year: "",
      genre: "",
      comment: "",
      coverArtUrl: "",
    };

    const titleElement = document.querySelector("h1");
    if (titleElement) {
      metadata.title = titleElement.textContent.trim();
    }

    const artistLink = document.querySelector(
      'a[href^="/@"].hover\\:underline.line-clamp-1',
    );
    if (artistLink) {
      metadata.artist = artistLink.textContent.trim();
    }

    const styleLinks = document.querySelectorAll('a[href^="/style/"]');
    const genres = Array.from(styleLinks).map((link) =>
      link.textContent.trim()
    );
    if (genres.length > 0) {
      metadata.genre = genres.join(", ");
    }

    const dateElement = document.querySelector(
      'span[title*="202"][title*="at"]',
    );
    if (dateElement) {
      const dateTitle = dateElement.getAttribute("title");
      if (dateTitle) {
        const yearMatch = dateTitle.match(/(\d{4})/);
        if (yearMatch) {
          metadata.year = yearMatch[1];
        }
      }
    }

    const coverImage = document.querySelector('img[alt="Song Cover Image"]');
    if (coverImage) {
      metadata.coverArtUrl = coverImage.src ||
        coverImage.getAttribute("data-src") || "";
    }

    return metadata;
  }

  function createDownloadButton() {
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.setAttribute("aria-label", "Playbar: Download");
    downloadButton.className =
      "relative inline-block font-sans font-medium text-center before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:border before:border-transparent after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:bg-transparent after:opacity-0 enabled:hover:after:opacity-100 transition duration-75 before:transition before:duration-75 after:transition after:duration-75 select-none cursor-pointer text-sm leading-[24px] rounded-md aspect-square p-0.5 text-current bg-transparent before:bg-current before:opacity-0 enabled:hover:before:opacity-10 disabled:after:bg-background-primary disabled:after:opacity-50";

    downloadButton.innerHTML = `
      <span class="relative flex flex-row items-center justify-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" class="text-current shrink-0 size-5 m-0.5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 10V7h4v5h3l-5 5-5-5h3z"/>
        </svg>
      </span>
    `;

    downloadButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        downloadButton.disabled = true;
        downloadButton.style.opacity = "0.5";

        const audioUrl = await getAudioUrl();

        if (!audioUrl) {
          alert(
            "Could not retrieve audio URL. Please try playing the song first.",
          );
          downloadButton.disabled = false;
          downloadButton.style.opacity = "1";
          return;
        }

        const { title, artist } = getSongInfo();

        const urlObj = new URL(audioUrl);
        const pathname = urlObj.pathname;
        const extensionMatch = pathname.match(/\.([^.]+)$/);
        const extension = extensionMatch ? extensionMatch[1] : "mp3";

        const filename = `${artist}-${title}.${extension}`.replace(
          /[<>:"/\\|?*\s]/g,
          "_",
        );

        const metadata = getDetailedMetadata();

        const response = await browser.runtime.sendMessage({
          action: "download",
          url: audioUrl,
          filename: filename,
          metadata: metadata,
        });

        if (response.success) {
          console.log("Download started:", filename);
        } else {
          throw new Error(response.error || "Download failed");
        }

        downloadButton.disabled = false;
        downloadButton.style.opacity = "1";
      } catch (error) {
        console.error("Download error:", error);
        alert("Download failed: " + (error.message || "Please try again."));
        downloadButton.disabled = false;
        downloadButton.style.opacity = "1";
      }
    });

    return downloadButton;
  }

  async function injectDownloadButton() {
    const playbar = await waitForPlaybar();

    const buttonContainer = playbar.querySelector(
      ".flex.flex-row.items-center.gap-1.w-min.max-md\\:hidden",
    );

    if (!buttonContainer) {
      console.error("Button container not found");
      return;
    }

    if (document.querySelector('button[aria-label="Playbar: Download"]')) {
      // button already exists
      return;
    }

    const downloadButton = createDownloadButton();

    const likeDislikeContainer = buttonContainer.querySelector(
      ".flex.flex-row.gap-1",
    );
    if (likeDislikeContainer) {
      likeDislikeContainer.parentNode.insertBefore(
        downloadButton,
        likeDislikeContainer.nextSibling,
      );
    } else {
      buttonContainer.insertBefore(downloadButton, buttonContainer.firstChild);
    }

    console.log("Download button injected successfully");
  }

  function init() {
    console.log("Suno Downloader: Extension initialized");
    injectDownloadButton();

    const observer = new MutationObserver(() => {
      if (
        document.querySelector(
          ".relative.h-auto.md\\:min-h-21.bg-background-secondary",
        ) &&
        !document.querySelector('button[aria-label="Playbar: Download"]')
      ) {
        console.log("Suno Downloader: Playbar detected, injecting button");
        injectDownloadButton();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
