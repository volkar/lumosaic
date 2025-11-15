# Lumosaic

**Adaptive photo gallery with intelligent row layout**

Lumosaic is a lightweight JavaScript library that automatically arranges photos of any orientation into perfectly aligned rows spanning the full screen width. It intelligently calculates image dimensions and creates a beautiful, responsive gallery layout.

![Preview](https://github.com/volkar/lumosaic/blob/main/preview.jpg?raw=true)

## Features

- **Intelligent Layout** - Automatically arranges images into perfectly aligned rows
- **Responsive Design** - Adapts to different screen sizes with customizable row heights
- **Flexible Input** - Supports arrays of objects, arrays of URLs, or existing DOM elements
- **Auto Dimension Detection** - Automatically retrieves image dimensions from image files (PNG, JPEG, WebP)
- **Highly Configurable** - Extensive options for customization
- **Shuffle Support** - Built-in image shuffling functionality
- **Lightweight** - No dependencies, pure vanilla JavaScript

## Installation

### Download

Download the latest release from the [releases page](https://github.com/volkar/lumosaic/releases/latest) and include the files in your project:

```html
<link rel="stylesheet" href="/lumosaic/lumosaic.css">
<script src="/lumosaic/lumosaic.js"></script>
```

### CDN (if available)

```html
<link rel="stylesheet" href="https://cdn.example.com/lumosaic/lumosaic.css">
<script src="https://cdn.example.com/lumosaic/lumosaic.js"></script>
```

## Quick Start

1. **Create a container element:**

```html
<div id="lumosaic"></div>
```

2. **Initialize the gallery:**

```javascript
const images = [
    { src: "https://picsum.photos/800/600?random=1", width: 800, height: 600 },
    { src: "https://picsum.photos/600/800?random=2", width: 600, height: 800 },
    { src: "https://picsum.photos/800/800?random=3", width: 800, height: 800 },
]

new LumosaicGallery("lumosaic", images).init()
```

That's it! Your gallery is ready.

## Usage

### Array of Objects

Using an array of image objects with specified width and height:

```javascript
const images = [
    { src: "https://picsum.photos/800/600?random=1", width: 800, height: 600 },
    { src: "https://picsum.photos/600/800?random=2", width: 600, height: 800 },
    { src: "https://picsum.photos/800/800?random=3", width: 800, height: 800 },
]

new LumosaicGallery("lumosaic", images).init()
```

### Array of Strings

Using an array of image URLs. Width and height will be calculated automatically if the `shouldRetrieveWidthAndHeight` option is set to `true`:

```javascript
const images = [
    "https://picsum.photos/800/600?random=1",
    "https://picsum.photos/600/800?random=2",
    "https://picsum.photos/800/800?random=3",
]

new LumosaicGallery("lumosaic", images).init({
    shouldRetrieveWidthAndHeight: true
})
```

### Replace Existing Images

Using existing images from a DOM element. The source element will be removed from the DOM:

```html
<div id="images">
    <img src="https://picsum.photos/800/600?random=1" />
    <img src="https://picsum.photos/600/800?random=2" />
    <img src="https://picsum.photos/800/800?random=3" />
</div>

<div id="lumosaic"></div>
```

```javascript
new LumosaicGallery("lumosaic", "images").init()
```

You can also use data attributes for more control:

```html
<div id="images">
    <img data-src="full-size.jpg" data-preview="preview.jpg" data-width="800" data-height="600" />
</div>
```

### Passing Options

Customize the gallery by passing options to the `init` method:

```javascript
new LumosaicGallery("lumosaic", images).init({
    maxRows: 2,
    gap: 10,
    rowHeight: 0.2
})
```

## Options

### Row Height Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rowHeightSM` | float | `0.25` | Height/width desired row ratio for mobile devices (screen width < 768px) |
| `rowHeightMD` | float | `0.2` | Height/width desired row ratio for medium devices (screen width >= 768px and < 1024px) |
| `rowHeightXL` | float | `0.18` | Height/width desired row ratio for extra large devices (screen width >= 1024px) |
| `rowHeight` | float | `none` | Height/width desired row ratio for all screen sizes (overwrites SM, MD and XL options) |

### Image Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldRetrieveWidthAndHeight` | boolean | `false` | If `true`, automatically retrieves image dimensions from the image file when width and height are not provided |
| `fallbackImageWidth` | integer | `1000` | Fallback width in pixels used when image dimensions cannot be retrieved |
| `fallbackImageHeight` | integer | `1000` | Fallback height in pixels used when image dimensions cannot be retrieved |
| `maxImageRatio` | float | `1.6` | Maximum width/height ratio allowed for images. Images exceeding this ratio will have their width adjusted to fit within the limit |
| `minImageRatio` | float | `0.65` | Minimum width/height ratio allowed for images. Images below this ratio will have their width adjusted to fit within the limit |

### Layout Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRows` | integer | `0` | Maximum number of rows to display. Set to `0` for no limit |
| `stretchLastRow` | boolean | `true` | If `true`, stretches the last row to fill the container by redistributing images from previous rows if needed |
| `shuffleImages` | boolean | `false` | If `true`, shuffles images randomly before rendering the gallery |
| `gap` | integer | `4` | Gap in pixels between images (horizontal) and between rows (vertical) |

## Methods

### `init(options)`

Initializes the gallery with the given options.

**Parameters:**
- `options` (object, optional) - Configuration options for the gallery

**Returns:** The gallery instance (for method chaining)

**Example:**
```javascript
const gallery = new LumosaicGallery("lumosaic", images).init({
    maxRows: 3,
    gap: 10
})
```

### `shuffleImages()`

Shuffles the images in the gallery and re-renders.

**Parameters:** None

**Example:**
```javascript
gallery.shuffleImages()
```

### `replaceImages(images)`

Replaces the images in the gallery with new images.

**Parameters:**
- `images` (array) - New array of images (can be objects, strings, or element ID)

**Example:**
```javascript
const newImages = [
    { src: "new-image.jpg", width: 800, height: 600 }
]
gallery.replaceImages(newImages)
```

### `changeOptions(options)`

Updates the gallery configuration with new options and re-renders the gallery.

**Parameters:**
- `options` (object) - New configuration options (will be merged with existing options)

**Example:**
```javascript
gallery.changeOptions({
    gap: 20,
    maxRows: 5
})
```

## Image Object Format

When using an array of objects, each image object can have the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `src` | string | Yes | Full-size image URL |
| `preview` | string | No | Preview/thumbnail URL (defaults to `src` if not provided) |
| `width` | integer | Recommended | Image width in pixels |
| `height` | integer | Recommended | Image height in pixels |
| `alt` | string | No | Alt text for the image |
| `title` | string | No | Title attribute for the image |

**Example:**
```javascript
{
    src: "https://example.com/full-size.jpg",
    preview: "https://example.com/preview.jpg",
    width: 1920,
    height: 1080,
    alt: "Beautiful landscape",
    title: "Photo by John Doe"
}
```

## Browser Support

Lumosaic works in all modern browsers that support:
- ES6 Classes
- `fetch` API (for automatic dimension detection)
- CSS Flexbox

## License

Released under the [MIT License](LICENSE).

## Links

- [Documentation & Demo](https://lumosaic.syntheticsymbiosis.com)
- [GitHub Repository](https://github.com/volkar/lumosaic)
- [Latest Release](https://github.com/volkar/lumosaic/releases/latest)

