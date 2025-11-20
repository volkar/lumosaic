/**
 * Lumosaic 1.1.0
 * Smart image gallery that automatically arranges photos of any orientation into perfectly aligned rows spanning full screen width
 *
 * https://lumosaic.syntheticsymbiosis.com
 * Copyright 2025 Sergey Volkar ⣿ SyntheticSymbiosis
 *
 * Released under the MIT License
 */

class Lumosaic {
    constructor(galleryID, imagesSource) {
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
            observeWindowWidth: true
        }

        // Class properties
        this.params = { galleryID, imagesSource }
        this.gallery = null
        this.images = []
        this.lastRenderedScreenSize = null
        this.resizeObserver = null
    }

    // --- Public functions ---

    async init(userConfig = {}) {
        // Get gallery wrapper
        this.gallery = document.getElementById(this.params.galleryID)
        if (!this.gallery) return

        // Merge user options with defaults
        this._mergeOptions(userConfig)

        // Add loading spinner
        this.gallery.classList.add('lumosaic-loading')

        // Gather images info from imageSource
        await this._processParams()

        // Render gallery
        if (this.config.shuffleImages) {
            this.shuffleImages()
        } else {
            this._renderGallery()
        }

        this.lastRenderedScreenSize = this._getObservedWidth()

        // Remove loading spinner
        this.gallery.classList.remove('lumosaic-loading')

        // Rerender gallery on window resize
        this._initResizeObserver()

        return this
    }

    replaceImages(images) {
        // Set new imageSource param, then rerender gallery
        this.params.imagesSource = images
        this._processParams().then(() => this._renderGallery())
    }

    shuffleImages() {
        // Shuffle images array and rerender gallery
        this.images.sort(() => Math.random() - 0.5)
        this._renderGallery()
    }

    changeOptions(options) {
        // Merge new options and rerender gallery
        this._mergeOptions(options)
        this._renderGallery()
    }

    destroy() {
        // Disconnect observer and destroy gallery
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
        this.gallery = null
    }

    // --- Private functions ---

    _initResizeObserver() {
        // Triggers a re-render of the gallery layout when a resize is detected.
        this.resizeObserver = new ResizeObserver(() => {
            const observedWidth = this._getObservedWidth()

            if (observedWidth && this.lastRenderedScreenSize !== observedWidth) {
                this._renderGallery()
                this.lastRenderedScreenSize = observedWidth
            }
        })

        if (this.config.observeWindowWidth) {
            // Observe window (body)
            this.resizeObserver.observe(document.body)
        } else {
            // Observe gallery
            this.resizeObserver.observe(this.gallery)
        }
    }

    _getObservedWidth() {
        // Returns the current observed width based on config (window width or gallery container width)
        let observedWidth
        if (this.config.observeWindowWidth) {
            observedWidth = window.innerWidth
        } else {
            observedWidth = this.gallery.offsetWidth
        }

        if (observedWidth && observedWidth >= 1024) {
            return 'xl'
        } else if (observedWidth && observedWidth >= 768 && observedWidth < 1024) {
            return 'md'
        } else if (observedWidth && observedWidth < 768) {
            return 'sm'
        }
        return false
    }

    async _processParams() {
        // Processes and normalizes input images from either an array or a DOM element source.
        this.images = []
        let rawList = []

        // Unify input into a temporary array
        if (Array.isArray(this.params.imagesSource)) {
            rawList = this.params.imagesSource
        } else if (typeof this.params.imagesSource === 'string') {
            const srcWrapper = document.getElementById(this.params.imagesSource)
            if (srcWrapper) {
                const elements = srcWrapper.querySelectorAll('img')
                rawList = Array.from(elements).map((img) => ({
                    preview: img.dataset.preview || img.src,
                    src: img.dataset.src || img.src,
                    width: parseInt(img.dataset.width || img.naturalWidth),
                    height: parseInt(img.dataset.height || img.naturalHeight)
                }))
                srcWrapper.remove()
            }
        }

        // Parallel processing with Promise.all
        const promises = rawList.map((img) => {
            const imgObj = typeof img === 'string' ? { src: img } : img
            return this._normalizeImageData(imgObj)
        })

        this.images = await Promise.all(promises)
    }

    async _normalizeImageData(img) {
        // Normalizes a single image data object, ensuring required properties are correct.
        if (img.url && !img.src) img.src = img.url
        if (img.src && !img.preview) img.preview = img.src
        if (img.preview && !img.src) img.src = img.preview

        if (!img.width || !img.height) {
            if (this.config.shouldRetrieveWidthAndHeight) {
                try {
                    const result = await this._getImageSizeFromUrl(img.src)
                    img.width = result.width
                    img.height = result.height
                } catch (e) {
                    console.warn(`Lumosaic: Could not fetch size for ${img.src}`, e)
                    img.width = 0
                    img.height = 0
                }
            } else {
                img.width = 0
                img.height = 0
            }
        }

        img.srcWidth = img.width
        img.srcHeight = img.height
        return img
    }

    async _getImageSizeFromUrl(url) {
        // Constants for file signatures
        const SIG = {
            PNG: 0x89504e47,
            PNG_END: 0x0d0a1a0a,
            JPEG_START: 0xffd8,
            WEBP_RIFF: 0x52494646,
            WEBP_WEBP: 0x57454250,
            VP8: 0x56503820,
            VP8L: 0x5650384c,
            VP8X: 0x56503858
        }

        const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

        const buffer = await res.arrayBuffer()
        const view = new DataView(buffer)

        // PNG
        if (view.getUint32(0) === SIG.PNG && view.getUint32(4) === SIG.PNG_END) {
            return {
                width: view.getUint32(16),
                height: view.getUint32(20),
                type: 'png'
            }
        }

        // JPEG
        if (view.getUint16(0) === SIG.JPEG_START) {
            let offset = 2
            while (offset < view.byteLength) {
                if (view.getUint8(offset) !== 0xff) break
                const marker = view.getUint8(offset + 1)
                const length = view.getUint16(offset + 2)

                // SOF0..SOF15 (Start Of Frame), skipping DHT, DAC, etc.
                if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                    return {
                        height: view.getUint16(offset + 5),
                        width: view.getUint16(offset + 7),
                        type: 'jpeg'
                    }
                }
                offset += 2 + length
            }
        }

        // WebP
        if (view.getUint32(0, false) === SIG.WEBP_RIFF && view.getUint32(8, false) === SIG.WEBP_WEBP) {
            let offset = 12
            while (offset < view.byteLength) {
                const chunk = view.getUint32(offset, false)
                const size = view.getUint32(offset + 4, true)

                if (chunk === SIG.VP8) {
                    const frame = offset + 10
                    return {
                        width: view.getUint16(frame + 6, true) & 0x3fff,
                        height: view.getUint16(frame + 8, true) & 0x3fff,
                        type: 'webp'
                    }
                } else if (chunk === SIG.VP8L) {
                    const b0 = view.getUint8(offset + 8)
                    const b1 = view.getUint8(offset + 9)
                    const b2 = view.getUint8(offset + 10)
                    const b3 = view.getUint8(offset + 11)
                    const width = 1 + (((b1 & 0x3f) << 8) | b0)
                    const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
                    return { width, height, type: 'webp' }
                } else if (chunk === SIG.VP8X) {
                    // Using internal helper instead of modifying DataView prototype
                    const width = 1 + this._getUint24(view, offset + 12, true)
                    const height = 1 + this._getUint24(view, offset + 15, true)
                    return { width, height, type: 'webp' }
                }
                offset += 8 + size + (size % 2)
            }
        }

        // Unsupported format
        return { width: 0, height: 0, type: 'unknown' }
    }

    _getUint24(view, offset, littleEndian) {
        // Helper for reading 3-byte unsigned int
        if (littleEndian) {
            return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
        } else {
            return (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2)
        }
    }

    _computeRows(images, containerWidth) {
        const rows = []
        let currentRow = []
        let currentRowWidth = 0

        for (const img of images) {
            const aspectRatio = img.height > 0 ? img.width / img.height : 1
            const scaledWidth = aspectRatio * this.targetRowHeight

            const projectedWidth = currentRowWidth + scaledWidth + currentRow.length * this.config.gap

            if (currentRow.length === 0 || projectedWidth < containerWidth) {
                // Image still fits in current row
                currentRow.push(img)
                currentRowWidth += scaledWidth
            } else if (projectedWidth > containerWidth && projectedWidth - containerWidth < containerWidth - currentRowWidth) {
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
                    height: img.height
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
            displayHeight: rowHeight
        }))
    }

    _renderGallery() {
        // Recalculate image dimensions based on current config
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

        // Calculate target row height based on observed width
        const observedWidth = this._getObservedWidth()
        const containerWidth = this.gallery.offsetWidth

        if (observedWidth === 'xl') {
            this.targetRowHeight = this.config.rowHeightXL * containerWidth
        } else if (observedWidth === 'md') {
            this.targetRowHeight = this.config.rowHeightMD * containerWidth
        } else {
            this.targetRowHeight = this.config.rowHeightSM * containerWidth
        }
        this.lastRenderedScreenSize = observedWidth

        const rows = this._computeRows(this.images, containerWidth)

        // Use DocumentFragment to minimize Reflows
        const fragment = document.createDocumentFragment()

        rows.forEach((row, rowIndex) => {
            // Calculate each row layout
            const lastRow = rowIndex === rows.length - 1
            const rowLayout = this._calculateRowLayout(row, containerWidth, lastRow)
            const rowDiv = document.createElement('div')
            rowDiv.className = 'lumosaic-row'
            rowDiv.style.aspectRatio = containerWidth / rowLayout[0].displayHeight

            rowLayout.forEach((img) => {
                // Each image in current row
                const itemDiv = document.createElement('div')
                itemDiv.className = 'lumosaic-item'
                const percentWidth = (img.displayWidth / containerWidth) * 100
                itemDiv.style.flexBasis = `${percentWidth}%`
                itemDiv.style.flexGrow = '0'
                itemDiv.style.flexShrink = '1'

                if (rowLayout.indexOf(img) < rowLayout.length - 1) {
                    // Apply horizontal gap to element
                    itemDiv.style.marginRight = `${this.config.gap}px`
                }

                const imgEl = document.createElement('img')
                imgEl.src = img.preview
                if (img.alt) {
                    imgEl.alt = img.alt
                }
                imgEl.loading = 'lazy'

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

            // Append row to fragment
            fragment.appendChild(rowDiv)
        })

        // Clear gallery
        this.gallery.innerHTML = ''
        // Append fragment to gallery
        this.gallery.appendChild(fragment)
    }

    _mergeOptions(options) {
        if (options.rowHeight) {
            // Overwrite all rowHeight variants
            options.rowHeightSM = options.rowHeightMD = options.rowHeightXL = options.rowHeight
            // Unset rowHeight
            delete options.rowHeight
        }
        this.config = { ...this.config, ...options }
    }
}
