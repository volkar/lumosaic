/**
 * Lumosaic 1.0.1
 * Smart image gallery that automatically arranges photos of any orientation into perfectly aligned rows spanning full screen width
 *
 * https://lumosaic.syntheticsymbiosis.com
 * Copyright 2025 Sergey Volkar ⣿ SyntheticSymbiosis
 *
 * Released under the MIT License
 */
class Lumosaic {
    constructor(galleryId, imagesSource, options = {}) {
        // Default config
        this.config = {
            rowHeightSM: 0.25,
            rowHeightMD: 0.2,
            rowHeightXL: 0.18,
            shouldRetrieveWidthAndHeight: false,
            fallbackImageWidth: 1000,
            fallbackImageHeight: 1000,
            maxImageRatio: 1.6,
            minImageRatio: 0.65,
            maxRows: 0,
            stretchLastRow: true,
            shuffleImages: false,
            gap: 4,
        }

        // Class variables
        this.gallery = document.getElementById(galleryId)
        this.imagesSource = imagesSource
        this.images = []
        this.targetRowHeight = null

        if (!this.gallery) {
            return
        }
    }

    replaceImages(images) {
        this.imagesSource = images
        this.images = []
        this._parseImagesSource().then(() => {
            this._renderLumosaicGallery()
        })
    }

    shuffleImages() {
        this.images.sort(() => Math.random() - 0.5)
        this._renderLumosaicGallery()
    }

    changeOptions(options) {
        // Merge options
        this._mergeOptions(options)
        // Calculate image dimensions
        this._calculateImageDimensions()
        // Render gallery with new options
        this._renderLumosaicGallery()
    }

    async _parseImagesSource() {
        if (Array.isArray(this.imagesSource)) {
            for (const img of this.imagesSource) {
                if (typeof img === "string") {
                    // Array of strings, only url present
                    this.images.push(await this._normalizeImageData({ src: img }))
                } else if (typeof img === "object") {
                    // Array of objects, normalize and add
                    this.images.push(await this._normalizeImageData(img))
                }
            }
        } else if (typeof this.imagesSource === "string") {
            // Wrapper for img elements
            const srcWrapper = document.getElementById(this.imagesSource)
            const elements = srcWrapper.querySelectorAll("img")

            for (const img of elements) {
                const imgData = {
                    preview: img.src,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                }
                if (img.dataset.preview) {
                    imgData.preview = img.dataset.preview
                }
                if (img.dataset.src) {
                    imgData.src = img.dataset.src
                }
                if (img.dataset.width) {
                    imgData.width = parseInt(img.dataset.width)
                }
                if (img.dataset.height) {
                    imgData.height = parseInt(img.dataset.height)
                }
                this.images.push(await this._normalizeImageData(imgData))
            }

            // Remove src wrapper from DOM
            srcWrapper.remove()
        }
    }

    async _normalizeImageData(img) {
        if (img.url && !img.src) {
            // No src, use url
            img.src = img.url
        }
        if (img.src && !img.preview) {
            // No preview, use src
            img.preview = img.src
        }
        if (img.preview && !img.src) {
            // No src, use preview
            img.src = img.preview
        }
        if (!img.width || !img.height) {
            // No dimensions, try to get image data
            let result = { width: 0, height: 0 }

            if (this.config.shouldRetrieveWidthAndHeight === true) {
                result = await this._getImageSizeFromUrl(img.src)
            }

            img.width = result.width
            img.height = result.height
        }

        // Set src width and height (will be recalculated later based on settings)
        img.srcWidth = img.width
        img.srcHeight = img.height
        // Clear
        img.width = 0
        img.height = 0

        return img
    }

    _calculateImageDimensions() {
        this.images.forEach((img) => {
            let calculatedWidth = img.srcWidth
            let calculatedHeight = img.srcHeight

            // If no width and height, use fallback values
            if (calculatedWidth === 0) {
                calculatedWidth = this.config.fallbackImageWidth
            }
            if (calculatedHeight === 0) {
                calculatedHeight = this.config.fallbackImageHeight
            }

            // Limit width/height ratio
            if (calculatedWidth / calculatedHeight > this.config.maxImageRatio) {
                calculatedWidth = this.config.maxImageRatio * calculatedHeight
            } else if (calculatedWidth / calculatedHeight < this.config.minImageRatio) {
                calculatedWidth = this.config.minImageRatio * calculatedHeight
            }

            // Set width and height
            img.width = calculatedWidth
            img.height = calculatedHeight
        })
    }

    async _getImageSizeFromUrl(url) {
        // Fetch first 64KB of file (enough for metadata)
        const res = await fetch(url, { headers: { Range: "bytes=0-65535" } })
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
        const buffer = await res.arrayBuffer()
        const view = new DataView(buffer)

        // ---- PNG ----
        if (
            view.getUint32(0) === 0x89504e47 && // "\x89PNG"
            view.getUint32(4) === 0x0d0a1a0a
        ) {
            const width = view.getUint32(16)
            const height = view.getUint32(20)
            return { width, height, type: "png" }
        }

        // ---- JPEG ----
        if (view.getUint16(0) === 0xffd8) {
            let offset = 2
            while (offset < view.byteLength) {
                if (view.getUint8(offset) !== 0xff) break
                const marker = view.getUint8(offset + 1)
                const length = view.getUint16(offset + 2)
                // SOF0..SOF15 markers store size
                if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                    const height = view.getUint16(offset + 5)
                    const width = view.getUint16(offset + 7)
                    return { width, height, type: "jpeg" }
                }
                offset += 2 + length
            }
            // Could not find JPEG size marker
        }

        // ---- WebP ----
        if (view.getUint32(0, false) === 0x52494646 && view.getUint32(8, false) === 0x57454250) {
            // "RIFF....WEBP"
            let offset = 12
            while (offset < view.byteLength) {
                const chunk = view.getUint32(offset, false)
                const size = view.getUint32(offset + 4, true)
                if (chunk === 0x56503820) {
                    // "VP8"
                    // Simple lossy WebP
                    const frame = offset + 10
                    const width = view.getUint16(frame + 6, true) & 0x3fff
                    const height = view.getUint16(frame + 8, true) & 0x3fff
                    return { width, height, type: "webp" }
                } else if (chunk === 0x5650384c) {
                    // "VP8L" (lossless)
                    const b0 = view.getUint8(offset + 8)
                    const b1 = view.getUint8(offset + 9)
                    const b2 = view.getUint8(offset + 10)
                    const b3 = view.getUint8(offset + 11)
                    const width = 1 + (((b1 & 0x3f) << 8) | b0)
                    const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
                    return { width, height, type: "webp" }
                } else if (chunk === 0x56503858) {
                    // "VP8X" (extended)
                    const width = 1 + view.getUint24(offset + 12, true)
                    const height = 1 + view.getUint24(offset + 15, true)
                    return { width, height, type: "webp" }
                }
                offset += 8 + size + (size % 2) // align to even byte
            }

            // Could not find WebP size chunk
            return { width: 0, height: 0, type: "webp" }
        }

        // Unsupported image format
        return { width: 0, height: 0, type: "unknown" }
    }

    _computeRows(images, containerWidth) {
        const rows = []
        let currentRow = []
        let currentRowWidth = 0

        for (let i = 0; i < images.length; i++) {
            const img = images[i]
            const aspectRatio = img.width / img.height
            const scaledWidth = aspectRatio * this.targetRowHeight

            const projectedWidth = currentRowWidth + scaledWidth + currentRow.length * this.config.gap

            if (currentRow.length === 0 || projectedWidth < containerWidth) {
                // Image still fits in current row
                currentRow.push(img)
                currentRowWidth += scaledWidth
            } else if (projectedWidth > containerWidth && (projectedWidth - containerWidth < containerWidth - currentRowWidth)) {
                // Image does not fit, but overlap is acceptable
                currentRow.push(img)
                currentRowWidth += scaledWidth
            } else {
                // Image does not fit, start new row with image
                if (currentRow.length > 0) {
                    rows.push([...currentRow])
                    if (this.config.maxRows && rows.length >= this.config.maxRows) {
                        // Max rows limit reached
                        currentRow = []
                        break
                    }
                }
                currentRow = [img]
                currentRowWidth = scaledWidth
            }

        }

        // Last row logic
        if (currentRow.length > 0) {
            if (this.config.stretchLastRow === true) {
                // If single image left, add to prev row
                if (currentRow.length === 1) {
                    if (rows.length > 0) {
                        rows[rows.length - 1].push(currentRow[0])
                    } else {
                        // Not enough rows
                        rows.push(currentRow)
                    }
                } else if (currentRow.length === 2) {
                    // If two images left, add to prev rows
                    if (rows.length > 1) {
                        // Move image from prev row
                        const firstImageInPrevRow = rows[rows.length - 1][0]
                        rows[rows.length - 1].shift()
                        rows[rows.length - 2].push(firstImageInPrevRow)
                        // Move current images to prev row
                        rows[rows.length - 1].push(currentRow[0])
                        rows[rows.length - 1].push(currentRow[1])
                    } else {
                        // Not enough rows
                        rows.push(currentRow)
                    }
                } else {
                    rows.push([...currentRow])
                }
            } else {
                // Don't need to stretch last row, push as is
                rows.push(currentRow)
            }
        }

        return rows
    }

    _calculateRowLayout(row, containerWidth, lastRow = false) {
        const totalGaps = (row.length - 1) * this.config.gap
        const availableWidth = containerWidth - totalGaps

        const totalAspectRatio = row.reduce((sum, img) => sum + img.width / img.height, 0)

        let rowHeight = availableWidth / totalAspectRatio

        if (lastRow === true && this.config.stretchLastRow === true) {
            // Last stretched row
            if (rowHeight > this.targetRowHeight) {
                // Alter image ratios to fit this height
                const shrinkRatio = rowHeight / this.targetRowHeight
                // Shrink
                row = row.map((img) => ({
                    ...img,
                    width: img.width * shrinkRatio,
                    height: img.height,
                }))
                rowHeight = this.targetRowHeight
            }
        } else if (lastRow === true && this.config.stretchLastRow === false) {
            // Last non-stretched row
            if (rowHeight > this.targetRowHeight) {
                // Don't allow images in last row to be taller than needed
                rowHeight = this.targetRowHeight
            }
        }

        return row.map((img) => ({
            ...img,
            displayWidth: (img.width / img.height) * rowHeight,
            displayHeight: rowHeight,
        }))
    }

    _renderLumosaicGallery() {
        // Calculate target row height based on screen size
        const screenWidth = window.innerWidth
        const containerWidth = this.gallery.offsetWidth

        if (screenWidth >= 1024) {
            this.targetRowHeight = this.config.rowHeightXL * containerWidth
        } else if (screenWidth >= 768) {
            this.targetRowHeight = this.config.rowHeightMD * containerWidth
        } else {
            this.targetRowHeight = this.config.rowHeightSM * containerWidth
        }

        const rows = this._computeRows(this.images, containerWidth)
        this.gallery.innerHTML = ""

        rows.forEach((row, rowIndex) => {
            const lastRow = rowIndex === rows.length - 1
            const rowLayout = this._calculateRowLayout(row, containerWidth, lastRow)
            const rowDiv = document.createElement("div")
            rowDiv.className = "lumosaic-row"
            rowDiv.style.height = `${rowLayout[0].displayHeight}px`

            rowLayout.forEach((img) => {
                const itemDiv = document.createElement("div")
                itemDiv.className = "lumosaic-item"
                itemDiv.style.flexBasis = `${img.displayWidth}px`
                itemDiv.style.flexGrow = "0"
                itemDiv.style.flexShrink = "0"

                if (rowLayout.indexOf(img) < rowLayout.length - 1) {
                    // Apply horizontal gap to element
                    itemDiv.style.marginRight = `${this.config.gap}px`
                }

                const imgEl = document.createElement("img")
                imgEl.src = img.preview
                if (img.alt) {
                    imgEl.alt = img.alt
                } else {
                    imgEl.alt = "Gallery image"
                }
                imgEl.loading = "lazy"

                // Additional data
                if (img.src) {
                    imgEl.dataset.src = img.src
                }
                if (img.title) {
                    imgEl.title = img.title
                }

                itemDiv.appendChild(imgEl)
                rowDiv.appendChild(itemDiv)
            })

            if (rowIndex < rows.length - 1) {
                // Apply vertical gap to row
                rowDiv.style.marginBottom = `${this.config.gap}px`
            }

            // Append row to gallery
            this.gallery.appendChild(rowDiv)
        })
    }

    _mergeOptions(options) {
        if (options.rowHeight) {
            // Overwrite all rowHeight variants
            options.rowHeightSM = options.rowHeight
            options.rowHeightMD = options.rowHeight
            options.rowHeightXL = options.rowHeight
            // Unset rowHeight
            delete options.rowHeight
        }
        this.config = { ...this.config, ...options }
    }

    async init(userConfig = {}) {

        this._mergeOptions(userConfig)

        // Add loading spinner
        this.gallery.classList.add("lumosaic-loading")
        // Gather images info
        await this._parseImagesSource()
        // Calculate image dimensions
        this._calculateImageDimensions()

        // Render gallery
        if (this.config.shuffleImages) {
            this.shuffleImages()
        } else {
            this._renderLumosaicGallery()
        }
        // Remove loading spinner
        this.gallery.classList.remove("lumosaic-loading")

        // Rerender on window resize with 100ms timeout
        let resizeTimeout
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
                this._renderLumosaicGallery()
            }, 100)
        })

        return this
    }
}

// Helper for reading 3-byte unsigned int
DataView.prototype.getUint24 = function (offset, littleEndian) {
    if (littleEndian) {
        return this.getUint8(offset) | (this.getUint8(offset + 1) << 8) | (this.getUint8(offset + 2) << 16)
    } else {
        return (this.getUint8(offset) << 16) | (this.getUint8(offset + 1) << 8) | this.getUint8(offset + 2)
    }
}
