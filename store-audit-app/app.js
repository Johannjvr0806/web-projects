"use strict";

const checklistInputs = [...document.querySelectorAll('input[name="audit-check"]')];
const progressLabel = document.getElementById("checklist-progress");
const auditDate = document.getElementById("audit-date");
const storeNameInput = document.getElementById("store-name");
const issueForm = document.getElementById("issue-form");
const issueComment = document.getElementById("issue-comment");
const issueImage = document.getElementById("issue-image");
const issueList = document.getElementById("issue-list");
const issueCount = document.getElementById("issue-count");
const issueError = document.getElementById("issue-error");
const fileName = document.getElementById("file-name");
const reportButton = document.getElementById("generate-report");
const reportMessage = document.getElementById("report-message");
const installButton = document.getElementById("install-app");
const installStatus = document.getElementById("install-status");
const issues = [];
const pendingIssueReads = new Set();
const auditDateValue = new Date();
let activeReportUrl = "";
let deferredInstallPrompt = null;

auditDate.textContent = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
}).format(auditDateValue);

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    installStatus.textContent = "Store Audit is installed on this device.";
});

installButton.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
        const installPrompt = deferredInstallPrompt;
        deferredInstallPrompt = null;
        try {
            await installPrompt.prompt();
            const choice = await installPrompt.userChoice;
            installStatus.textContent = choice.outcome === "accepted"
                ? "Store Audit is being installed."
                : "Installation was cancelled. You can install it later from your browser menu.";
        } catch (error) {
            console.error("Could not start Store Audit installation.", error);
            installStatus.textContent = "Could not start installation. Try the Install app option in your browser menu.";
        }
        return;
    }

    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
        installStatus.textContent = "Store Audit is already installed on this device.";
    } else if (window.location.protocol === "file:") {
        installStatus.textContent = "To install on your tablet, first publish this app to a secure HTTPS website, then open its link on the tablet.";
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
        installStatus.textContent = "In Safari, tap Share, then choose Add to Home Screen.";
    } else {
        installStatus.textContent = "Open your browser menu and choose Install app or Add to Home screen.";
    }
});

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("Could not register the offline app service worker.", error);
        installStatus.textContent = "App installation is unavailable because offline support could not be enabled.";
    });
}

function updateChecklistProgress() {
    const completed = checklistInputs.filter((input) => input.checked).length;
    progressLabel.textContent = `${completed} / ${checklistInputs.length} complete`;
}

checklistInputs.forEach((input) => {
    input.addEventListener("change", updateChecklistProgress);
});

issueImage.addEventListener("change", () => {
    fileName.textContent = issueImage.files.length > 0
        ? issueImage.files[0].name
        : "JPG, PNG or other image";
});

function makeIssueCard(issue, index) {
    const card = document.createElement("article");
    card.className = "issue-card";

    if (issue.imageUrl) {
        const image = document.createElement("img");
        image.className = "issue-image";
        image.src = issue.imageUrl;
        image.alt = `Photo attached to issue ${index + 1}`;
        card.append(image);
    } else {
        const placeholder = document.createElement("div");
        placeholder.className = "issue-image issue-image-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.textContent = "!";
        card.append(placeholder);
    }

    const content = document.createElement("div");
    content.className = "issue-content";

    const title = document.createElement("strong");
    title.textContent = `Issue ${index + 1}`;
    content.append(title);

    const note = document.createElement("p");
    note.textContent = issue.comment || "Photo added; no comment.";
    content.append(note);

    const time = document.createElement("time");
    time.dateTime = issue.createdAt.toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
    }).format(issue.createdAt);
    content.append(time);
    card.append(content);
    return card;
}

function showIssueError(message) {
    issueError.textContent = message;
    issueError.hidden = false;
}

function resetAuditForNextStore() {
    storeNameInput.value = "";
    checklistInputs.forEach((input) => {
        input.checked = false;
    });
    updateChecklistProgress();

    issues.length = 0;
    issueList.replaceChildren();
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.id = "empty-state";

    const emptyIcon = document.createElement("span");
    emptyIcon.className = "empty-icon";
    emptyIcon.setAttribute("aria-hidden", "true");
    emptyIcon.textContent = "✓";

    const emptyCopy = document.createElement("p");
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "Nothing flagged yet";
    emptyCopy.append(emptyTitle, document.createElement("br"), "Issues you add will appear here.");
    emptyState.append(emptyIcon, emptyCopy);
    issueList.append(emptyState);

    issueCount.textContent = "0 ISSUES";
    issueComment.value = "";
    issueImage.value = "";
    fileName.textContent = "JPG, PNG or other image";
    issueError.textContent = "";
    issueError.hidden = true;
    storeNameInput.focus();
}

issueForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const comment = issueComment.value.trim();
    const image = issueImage.files[0];

    issueError.hidden = true;
    issueError.textContent = "";

    if (!comment && !image) {
        showIssueError("Add a comment or choose a photo before adding an issue.");
        return;
    }

    if (image && !image.type.startsWith("image/")) {
        showIssueError("Choose a valid image file.");
        return;
    }

    const addIssue = (imageUrl) => {
        const issue = { comment, imageUrl, createdAt: new Date() };
        issues.push(issue);

        const emptyState = document.getElementById("empty-state");
        if (emptyState) {
            emptyState.remove();
        }

        issueList.prepend(makeIssueCard(issue, issues.length - 1));
        issueCount.textContent = `${issues.length} ${issues.length === 1 ? "ISSUE" : "ISSUES"}`;
        issueComment.value = "";
        issueImage.value = "";
        fileName.textContent = "JPG, PNG or other image";
    };

    if (image) {
        const reader = new FileReader();
        const pendingRead = new Promise((resolve, reject) => {
            reader.addEventListener("load", () => {
                if (typeof reader.result !== "string") {
                    reject(new Error("The selected image could not be read. Please try another image."));
                    return;
                }
                resolve(reader.result);
            });
            reader.addEventListener("error", () => {
                reject(new Error("The selected image could not be read. Please try another image."));
            });
            reader.readAsDataURL(image);
        }).then((imageUrl) => {
            addIssue(imageUrl);
        }).catch((error) => {
            showIssueError(error instanceof Error ? error.message : "The selected image could not be read. Please try another image.");
        });
        pendingIssueReads.add(pendingRead);
        pendingRead.finally(() => pendingIssueReads.delete(pendingRead));
        return;
    }

    addIssue("");
});

function getPdfLibraries() {
    const JsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!JsPdf) {
        throw new Error("The PDF tools could not be loaded. Check your connection and try again.");
    }
    return JsPdf;
}

function drawReportContinuationHeader(pdf, storeName, margin) {
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(0, 86, 145);
    pdf.rect(0, 0, pageWidth, 19, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text("PnP", margin, 12);
    const pnpWidth = pdf.getTextWidth("PnP ");
    pdf.setTextColor(217, 45, 32);
    pdf.text("Clothing", margin + pnpWidth, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(storeName, pageWidth - margin, 12, { align: "right" });
    pdf.setTextColor(38, 50, 56);
}

function startReportPage(pdf, storeName, margin) {
    pdf.addPage();
    drawReportContinuationHeader(pdf, storeName, margin);
    return 28;
}

function ensureReportSpace(pdf, y, needed, pageHeight, margin, storeName) {
    if (y + needed <= pageHeight - margin - 8) {
        return y;
    }
    return startReportPage(pdf, storeName, margin);
}

function drawReportFooter(pdf, margin, pageHeight, pageNumber, totalPages) {
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.setDrawColor(221, 228, 234);
    pdf.setLineWidth(0.3);
    pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(107, 119, 133);
    pdf.text("PnP Clothing  |  Store Visit Report", margin, pageHeight - 8);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
}

function drawSectionHeading(pdf, title, x, y) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0, 86, 145);
    pdf.text(title, x, y);
    pdf.setDrawColor(217, 45, 32);
    pdf.setLineWidth(0.8);
    pdf.line(x, y + 2.5, x + 18, y + 2.5);
}

function imageAsJpeg(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener("load", () => {
            const maxDimension = 1400;
            const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) {
                reject(new Error("A photo could not be prepared for the PDF."));
                return;
            }
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve({
                data: canvas.toDataURL("image/jpeg", 0.86),
                width: canvas.width,
                height: canvas.height
            });
        });
        image.addEventListener("error", () => reject(new Error("An issue photo could not be loaded for the PDF.")));
        image.src = dataUrl;
    });
}

async function generateReport() {
    const JsPdf = getPdfLibraries();
    const storeName = storeNameInput.value.trim();
    if (!storeName) {
        reportMessage.textContent = "Enter a store name before generating the report.";
        storeNameInput.focus();
        return;
    }

    await Promise.all([...pendingIssueReads]);
    const completedCount = checklistInputs.filter((input) => input.checked).length;
    const pdf = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const navy = [0, 86, 145];
    const red = [217, 45, 32];
    const ink = [38, 50, 56];
    const muted = [107, 119, 133];
    const currentDate = new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
    }).format(new Date());

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(23);
    pdf.setTextColor(...navy);
    pdf.text("PnP", margin, 20);
    const pnpWidth = pdf.getTextWidth("PnP ");
    pdf.setTextColor(...red);
    pdf.text("Clothing", margin + pnpWidth, 20);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(...ink);
    pdf.text("Store Visit Report", margin, 36);
    pdf.setDrawColor(...red);
    pdf.setLineWidth(1.1);
    pdf.line(margin, 40, margin + 28, 40);

    const infoY = 47;
    const infoHeight = 29;
    const gutter = 4;
    const infoColumnWidth = (contentWidth - gutter) / 2;
    const infoBlocks = [
        { x: margin, label: "AREA MANAGER", value: "Johann Janse van Rensburg" },
        {
            x: margin + infoColumnWidth + gutter,
            label: "VISIT DATE",
            value: currentDate
        }
    ];
    infoBlocks.forEach((block) => {
        pdf.setFillColor(245, 248, 251);
        pdf.setDrawColor(221, 228, 234);
        pdf.roundedRect(block.x, infoY, infoColumnWidth, infoHeight, 2, 2, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(...muted);
        pdf.text(block.label, block.x + 5, infoY + 8);
        pdf.setFontSize(10);
        pdf.setTextColor(...ink);
        pdf.text(pdf.splitTextToSize(block.value, infoColumnWidth - 10), block.x + 5, infoY + 17);
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...muted);
    pdf.text(`STORE  ${storeName}`, margin + 1, infoY + infoHeight + 7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...navy);
    pdf.text(`${completedCount} / ${checklistInputs.length} STANDARDS COMPLETE`, pageWidth - margin, infoY + infoHeight + 7, { align: "right" });

    let y = infoY + infoHeight + 21;
    drawSectionHeading(pdf, "Checklist Summary", margin, y);
    y += 8;

    const columnWidths = [contentWidth * 0.55, contentWidth * 0.23, contentWidth * 0.22];
    const columnX = [margin, margin + columnWidths[0], margin + columnWidths[0] + columnWidths[1]];
    const headerHeight = 12;
    pdf.setFillColor(...navy);
    pdf.roundedRect(margin, y, contentWidth, headerHeight, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text("OPERATIONAL STANDARDS", columnX[0] + 3, y + 7.7);
    pdf.text("STATUS", columnX[1] + 2, y + 7.7);
    pdf.text("VERIFICATION", columnX[2] + 2, y + 7.7);
    y += headerHeight;

    checklistInputs.forEach((input, index) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        const standardLines = pdf.splitTextToSize(input.value, columnWidths[0] - 7);
        const statusText = input.checked ? "COMPLETED" : "PENDING / TO DO";
        const statusLines = pdf.splitTextToSize(statusText, columnWidths[1] - 5);
        const verificationText = input.checked ? "Verified" : "Pending";
        const verificationLines = pdf.splitTextToSize(verificationText, columnWidths[2] - 5);
        const lineCount = Math.max(standardLines.length, statusLines.length, verificationLines.length);
        const rowHeight = Math.max(11, lineCount * 4.5 + 5);
        y = ensureReportSpace(pdf, y, rowHeight, pageHeight, margin, storeName);

        if (index % 2 === 0) {
            pdf.setFillColor(246, 248, 250);
            pdf.rect(margin, y, contentWidth, rowHeight, "F");
        }
        pdf.setDrawColor(225, 231, 236);
        pdf.setLineWidth(0.2);
        pdf.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(...ink);
        pdf.text(standardLines, columnX[0] + 3, y + 5.7);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(input.checked ? 7.8 : 7.1);
        pdf.setTextColor(...(input.checked ? [35, 128, 80] : [83, 91, 99]));
        pdf.text(statusLines, columnX[1] + 2, y + 5.7);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(...(input.checked ? [35, 128, 80] : muted));
        pdf.text(verificationLines, columnX[2] + 2, y + 5.7);
        y += rowHeight;
    });

    y += 12;
    y = ensureReportSpace(pdf, y, 20, pageHeight, margin, storeName);
    drawSectionHeading(pdf, `Issue & Action Logs (${issues.length})`, margin, y);
    y += 9;

    if (issues.length === 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(...muted);
        pdf.text("No issues or follow-up actions were recorded during this visit.", margin, y + 2);
        y += 10;
    }

    const contentBottom = pageHeight - margin - 8;
    const cardPadding = 5;
    const cardLineHeight = 4.6;
    const headingHeight = 10;
    const photoColumnWidth = 58;
    const photoGap = 7;

    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        const preparedImage = issue.imageUrl ? await imageAsJpeg(issue.imageUrl) : null;
        const maxImageWidth = 52;
        const maxImageHeight = 50;
        const imageScale = preparedImage
            ? Math.min(maxImageWidth / preparedImage.width, maxImageHeight / preparedImage.height)
            : 0;
        const imageWidth = preparedImage ? preparedImage.width * imageScale : 0;
        const imageHeight = preparedImage ? preparedImage.height * imageScale : 0;
        const comment = issue.comment || "Photo added; no comment.";
        const commentX = preparedImage ? margin + cardPadding + photoColumnWidth + photoGap : margin + cardPadding + 2;
        const commentWidth = preparedImage
            ? contentWidth - photoColumnWidth - photoGap - cardPadding * 2
            : contentWidth - cardPadding * 2 - 4;
        const commentLines = pdf.splitTextToSize(comment, commentWidth);
        let lineOffset = 0;
        let isFirstSegment = true;

        while (lineOffset < commentLines.length) {
            const minimumContentHeight = Math.max(imageHeight, preparedImage && isFirstSegment ? 25 : 5);
            const minimumCardHeight = headingHeight + cardPadding * 2 + minimumContentHeight;
            if (contentBottom - y < minimumCardHeight + 5) {
                y = startReportPage(pdf, storeName, margin);
            }

            const availableHeight = contentBottom - y;
            const firstSegmentImage = preparedImage && isFirstSegment;
            const textStartY = y + headingHeight + cardPadding + 4;
            const textRoom = availableHeight - headingHeight - cardPadding * 2 - 5;
            const linesAvailable = Math.max(1, Math.floor(textRoom / cardLineHeight));
            const segmentLines = commentLines.slice(lineOffset, lineOffset + linesAvailable);
            const textHeight = Math.max(5, segmentLines.length * cardLineHeight);
            const imageFrameHeight = firstSegmentImage ? Math.max(imageHeight, 25) : 0;
            const cardContentHeight = Math.max(imageFrameHeight, textHeight);
            const cardHeight = headingHeight + cardPadding + cardContentHeight + cardPadding;

            if (cardHeight > availableHeight) {
                y = startReportPage(pdf, storeName, margin);
                continue;
            }

            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(210, 220, 228);
            pdf.setLineWidth(0.35);
            pdf.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, "FD");
            pdf.setFillColor(245, 248, 251);
            pdf.roundedRect(margin + 0.2, y + 0.2, contentWidth - 0.4, headingHeight, 1.8, 1.8, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.setTextColor(...navy);
            pdf.text(`Action Item #${index + 1}${isFirstSegment ? "" : " (continued)"}`, margin + cardPadding, y + 6.5);

            if (firstSegmentImage) {
                const imageX = margin + cardPadding;
                const imageY = textStartY;
                pdf.setFillColor(248, 249, 250);
                pdf.setDrawColor(225, 231, 236);
                pdf.roundedRect(imageX, imageY, photoColumnWidth - 4, imageFrameHeight, 1.5, 1.5, "FD");
                pdf.addImage(
                    preparedImage.data,
                    "JPEG",
                    imageX + (photoColumnWidth - 4 - imageWidth) / 2,
                    imageY + (imageFrameHeight - imageHeight) / 2,
                    imageWidth,
                    imageHeight
                );
            }

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(...ink);
            pdf.text(segmentLines, commentX, textStartY);

            lineOffset += segmentLines.length;
            y += cardHeight + 7;
            isFirstSegment = false;
            if (lineOffset < commentLines.length) {
                y = startReportPage(pdf, storeName, margin);
            }
        }
    }

    const totalPages = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        drawReportFooter(pdf, margin, pageHeight, page, totalPages);
    }

    const safeStoreName = storeName
        .normalize("NFKD")
        .replace(/[^\w -]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "store";
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `store-visit-report-${safeStoreName}-${datePart}.pdf`;
    const reportBlob = pdf.output("blob");
    if (!(reportBlob instanceof Blob) || reportBlob.size === 0) {
        throw new Error("The PDF was empty and could not be downloaded. Please try again.");
    }

    if (activeReportUrl) {
        URL.revokeObjectURL(activeReportUrl);
    }
    activeReportUrl = URL.createObjectURL(reportBlob);

    const downloadLink = document.createElement("a");
    downloadLink.href = activeReportUrl;
    downloadLink.download = filename;
    downloadLink.hidden = true;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    reportMessage.replaceChildren(
        document.createTextNode("Report ready. This audit has been cleared for the next store. If it did not download automatically, "),
        Object.assign(document.createElement("a"), {
            href: activeReportUrl,
            download: filename,
            textContent: "download the PDF"
        }),
        document.createTextNode(".")
    );
    resetAuditForNextStore();
}

reportButton.addEventListener("click", async () => {
    reportMessage.textContent = "Preparing your report…";
    reportButton.disabled = true;
    reportButton.setAttribute("aria-busy", "true");

    try {
        await generateReport();
    } catch (error) {
        console.error("Unable to generate the store audit report.", error);
        reportMessage.textContent = error instanceof Error
            ? error.message
            : "The report could not be generated. Please try again.";
    } finally {
        reportButton.disabled = false;
        reportButton.removeAttribute("aria-busy");
    }
});

updateChecklistProgress();
