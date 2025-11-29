browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "download") {
    const audioFilename = message.filename;
    const metadata = message.metadata;

    browser.downloads
      .download({
        url: message.url,
        filename: audioFilename,
        saveAs: false,
      })
      .then((downloadId) => {
        console.log("Download started with ID:", downloadId);

        const downloadListener = (delta) => {
          if (delta.id === downloadId && delta.state) {
            if (delta.state.current === "complete") {
              // query to get the full download path
              browser.downloads.search({ id: downloadId }).then((downloads) => {
                if (downloads.length > 0) {
                  const downloadPath = downloads[0].filename;

                  if (metadata.coverArtUrl) {
                    const coverUrlObj = new URL(metadata.coverArtUrl);
                    const coverPathname = coverUrlObj.pathname;
                    const coverExtMatch = coverPathname.match(/\.([^.]+)$/);
                    const coverExt = coverExtMatch ? coverExtMatch[1] : "jpg";

                    const coverFilename = audioFilename.replace(
                      /\.[^.]+$/,
                      `_cover.${coverExt}`,
                    );

                    browser.downloads
                      .download({
                        url: metadata.coverArtUrl,
                        filename: coverFilename,
                        saveAs: false,
                      })
                      .then(() => {
                        console.log("Cover art downloaded:", coverFilename);
                      })
                      .catch((error) => {
                        console.error("Failed to download cover art:", error);
                      });
                  }

                  const tagData = [
                    {
                      file_path: downloadPath,
                      artist: metadata.artist,
                      album: metadata.album,
                      title: metadata.title,
                      track_num: metadata.track_num,
                      track_total: metadata.track_total,
                      disc_num: metadata.disc_num,
                      disc_total: metadata.disc_total,
                      year: metadata.year,
                      genre: metadata.genre,
                      comment: metadata.comment,
                    },
                  ];

                  const jsonFilename = audioFilename.replace(
                    /\.[^.]+$/,
                    "_tags.json",
                  );
                  const jsonBlob = new Blob(
                    [JSON.stringify(tagData, null, 2)],
                    {
                      type: "application/json",
                    },
                  );
                  const jsonUrl = URL.createObjectURL(jsonBlob);

                  browser.downloads
                    .download({
                      url: jsonUrl,
                      filename: jsonFilename,
                      saveAs: false,
                    })
                    .then(() => {
                      console.log("Tags JSON created:", jsonFilename);
                      URL.revokeObjectURL(jsonUrl);
                    })
                    .catch((error) => {
                      console.error("Failed to create tags JSON:", error);
                      URL.revokeObjectURL(jsonUrl);
                    });
                }
              });

              browser.downloads.onChanged.removeListener(downloadListener);
            }
          }
        };

        browser.downloads.onChanged.addListener(downloadListener);

        sendResponse({ success: true, downloadId: downloadId });
      })
      .catch((error) => {
        console.error("Download failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    // indicate we send response asynchronously
    return true;
  }
});
