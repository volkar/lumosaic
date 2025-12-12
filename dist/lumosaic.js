/**
 * Lumosaic 1.1.4
 * Smart image gallery that automatically arranges photos of any orientation into perfectly aligned rows spanning full screen width
 *
 * https://lumosaic.syntheticsymbiosis.com
 * Copyright 2025 Sergey Volkar ⣿ SyntheticSymbiosis
 *
 * Released under the MIT License
 */

class Lumosaic {
    constructor(galleryID, imagesSource) {
        // Default options
        this.options = {
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
            playButtonOnVideoCover: true,
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
        this.#mergeOptions(userConfig)

        // Add loading spinner
        this.gallery.classList.add('lumosaic-loading')

        // Gather images info from imageSource
        await this.#processParams()

        // Render gallery
        if (this.options.shuffleImages) {
            this.shuffleImages()
        } else {
            this.#renderGallery()
        }

        this.lastRenderedScreenSize = this.#getObservedWidth()

        // Remove loading spinner
        this.gallery.classList.remove('lumosaic-loading')

        // Rerender gallery on window resize
        this.#initResizeObserver()

        return this
    }

    replaceImages(images) {
        // Set new imageSource param, then rerender gallery
        this.params.imagesSource = images
        this.#processParams().then(() => this.#renderGallery())
    }

    shuffleImages() {
        // Shuffle images array and rerender gallery
        this.images.sort(() => Math.random() - 0.5)
        this.#renderGallery()
    }

    updateOptions(newOptions) {
        // Merge new options and rerender gallery
        this.#mergeOptions(newOptions)
        this.#renderGallery()
    }

    destroy() {
        // Disconnect observer and destroy gallery
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
        this.gallery = null
    }

    // --- Private functions ---

    #initResizeObserver() {
        // Triggers a re-render of the gallery layout when a resize is detected.
        this.resizeObserver = new ResizeObserver(() => {
            const observedWidth = this.#getObservedWidth()

            if (observedWidth && this.lastRenderedScreenSize !== observedWidth) {
                this.#renderGallery()
                this.lastRenderedScreenSize = observedWidth
            }
        })

        if (this.options.observeWindowWidth) {
            // Observe window (body)
            this.resizeObserver.observe(document.body)
        } else {
            // Observe gallery
            this.resizeObserver.observe(this.gallery)
        }
    }

    #getObservedWidth() {
        // Returns the current observed width based on options (window width or gallery container width)
        let observedWidth
        if (this.options.observeWindowWidth) {
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

    async #processParams() {
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
            return this.#normalizeImageData(imgObj)
        })

        this.images = await Promise.all(promises)
    }

    async #normalizeImageData(img) {
        // Normalizes a single image data object, ensuring required properties are correct.
        if (img.url && !img.src) img.src = img.url
        if (img.src && !img.preview) img.preview = img.src
        if (img.preview && !img.src) img.src = img.preview

        if (!img.width || !img.height) {
            if (this.options.shouldRetrieveWidthAndHeight) {
                try {
                    const result = await this.#getImageSizeFromUrl(img.src)
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

    async #getImageSizeFromUrl(url) {
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
                    const width = 1 + this.#getUint24(view, offset + 12, true)
                    const height = 1 + this.#getUint24(view, offset + 15, true)
                    return { width, height, type: 'webp' }
                }
                offset += 8 + size + (size % 2)
            }
        }

        // Unsupported format
        return { width: 0, height: 0, type: 'unknown' }
    }

    #getUint24(view, offset, littleEndian) {
        // Helper for reading 3-byte unsigned int
        if (littleEndian) {
            return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
        } else {
            return (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2)
        }
    }

    #computeRows(images, containerWidth) {
        const rows = []
        let currentRow = []
        let currentRowWidth = 0

        for (const img of images) {
            const aspectRatio = img.height > 0 ? img.width / img.height : 1
            const scaledWidth = aspectRatio * this.targetRowHeight

            const projectedWidth = currentRowWidth + scaledWidth + currentRow.length * this.options.gap

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
                    if (this.options.maxRows && rows.length >= this.options.maxRows) {
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
            if (this.options.stretchLastRow === true) {
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

    #calculateRowLayout(row, containerWidth, lastRow = false) {
        const totalGaps = (row.length - 1) * this.options.gap
        const availableWidth = containerWidth - totalGaps

        const totalAspectRatio = row.reduce((sum, img) => sum + img.width / img.height, 0)

        let rowHeight = availableWidth / totalAspectRatio

        if (lastRow === true && this.options.stretchLastRow === true) {
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
        } else if (lastRow === true && this.options.stretchLastRow === false) {
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

    #renderGallery() {
        // Recalculate image dimensions based on current options
        this.images.forEach((img) => {
            let calculatedWidth = img.srcWidth
            let calculatedHeight = img.srcHeight

            // If no width and height, use fallback values
            if (calculatedWidth === 0) {
                calculatedWidth = this.options.fallbackImageWidth
            }
            if (calculatedHeight === 0) {
                calculatedHeight = this.options.fallbackImageHeight
            }

            // Limit width/height ratio
            if (calculatedWidth / calculatedHeight > this.options.maxImageRatio) {
                calculatedWidth = this.options.maxImageRatio * calculatedHeight
            } else if (calculatedWidth / calculatedHeight < this.options.minImageRatio) {
                calculatedWidth = this.options.minImageRatio * calculatedHeight
            }

            // Set width and height
            img.width = calculatedWidth
            img.height = calculatedHeight
        })

        // Calculate target row height based on observed width
        const observedWidth = this.#getObservedWidth()
        const containerWidth = this.gallery.offsetWidth

        if (observedWidth === 'xl') {
            this.targetRowHeight = this.options.rowHeightXL * containerWidth
        } else if (observedWidth === 'md') {
            this.targetRowHeight = this.options.rowHeightMD * containerWidth
        } else {
            this.targetRowHeight = this.options.rowHeightSM * containerWidth
        }
        this.lastRenderedScreenSize = observedWidth

        const rows = this.#computeRows(this.images, containerWidth)

        // Use DocumentFragment to minimize Reflows
        const fragment = document.createDocumentFragment()

        rows.forEach((row, rowIndex) => {
            // Calculate each row layout
            const lastRow = rowIndex === rows.length - 1
            const rowLayout = this.#calculateRowLayout(row, containerWidth, lastRow)
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
                    itemDiv.style.marginRight = `${this.options.gap}px`
                }

                const imgEl = document.createElement('img')
                imgEl.src = img.preview
                if (img.alt) {
                    imgEl.alt = img.alt
                }
                imgEl.loading = 'lazy'

                // Additional data

                if (img.src) {
                    // Expose data-src
                    imgEl.dataset.src = img.src
                }
                if (img.title) {
                    // Expose data-title
                    imgEl.title = img.title
                }
                if (img.exif) {
                    // Expose EXIF data
                    imgEl.dataset.exif = JSON.stringify(img.exif)
                }
                if (this.options.playButtonOnVideoCover) {
                    // If source is video, add play icon
                    if (img.src.toLowerCase().endsWith('.mp4') ||
                        img.src.toLowerCase().endsWith('.webm') ||
                        img.src.toLowerCase().endsWith('.mov') ||
                        img.src.toLowerCase().endsWith('.avi') ||
                        img.src.toLowerCase().endsWith('.wmv')) {

                        const iconEl = document.createElement('div')
                        iconEl.className = 'lumosaic-play-icon'
                        iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m10.775 15.475l4.6-3.05q.225-.15.225-.425t-.225-.425l-4.6-3.05q-.25-.175-.513-.038T10 8.926v6.15q0 .3.263.438t.512-.038M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12q0-.8.125-1.6T2.5 8.825q.125-.4.513-.537t.737.062q.375.2.538.588t.037.812q-.15.55-.238 1.113T4 12q0 3.35 2.325 5.675T12 20t5.675-2.325T20 12t-2.325-5.675T12 4q-.6 0-1.187.087T9.65 4.35q-.425.125-.8-.025T8.3 3.8t-.013-.762t.563-.513q.75-.275 1.55-.4T12 2q2.075 0 3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22M5.5 7q-.625 0-1.062-.437T4 5.5t.438-1.062T5.5 4t1.063.438T7 5.5t-.437 1.063T5.5 7m6.5 5"/></svg>'
                        itemDiv.appendChild(iconEl)
                    }
                }

                itemDiv.appendChild(imgEl)
                rowDiv.appendChild(itemDiv)
            })

            if (rowIndex < rows.length - 1) {
                // Apply vertical gap to row
                rowDiv.style.marginBottom = `${this.options.gap}px`
            }

            // Append row to fragment
            fragment.appendChild(rowDiv)
        })

        // Clear gallery
        this.gallery.innerHTML = ''
        // Append fragment to gallery
        this.gallery.appendChild(fragment)
    }

    #mergeOptions(newOptions) {
        if (newOptions.rowHeight) {
            // Overwrite all rowHeight variants
            newOptions.rowHeightSM = newOptions.rowHeightMD = newOptions.rowHeightXL = newOptions.rowHeight
            // Unset rowHeight
            delete newOptions.rowHeight
        }
        this.options = { ...this.options, ...newOptions }
    }
}
