# DataMining AI — Data Science Toolkit

DataMining AI is a comprehensive, browser-based, AI-powered data science toolkit. It allows you to upload datasets, analyze them, visualize the data through various chart types in a Jupyter/Colab-style notebook interface, and interact with an AI assistant to gain insights—all without leaving your browser.

## Features

- **Built-in AI Assistant**: Talk to an AI Data Analyst about your data. You can use the built-in AI or supply your own Google Gemini API key.
- **Client-Side Processing**: Data is processed locally in your browser using powerful libraries.
- **Interactive Visualizations**: Create Bar, Line, Scatter, Histogram, Pie, Box, Heatmap, and many more chart types using Plotly.js.
- **Notebook Interface**: A multi-cell, scrollable workspace reminiscent of Google Colab or Jupyter Notebooks.
- **Data Science Tools**:
  - Null value handling (mean, median, mode, forward/backward fill)
  - Linear Regression
  - Correlation Matrix
  - Descriptive Statistics
  - Outlier Detection
  - Data Normalization
- **Export & Reporting**:
  - Export charts as PNG or PDF
  - Download processed data as CSV or JSON
  - Generate a full A4 Report Sheet containing charts, stats, and Python code snippets.

## Technologies Used

- **HTML5 & CSS3**: Custom themes with a modern, responsive UI.
- **Vanilla JavaScript**: Logic and state management.
- **Plotly.js**: For rendering high-quality interactive charts.
- **Papa Parse**: For parsing CSV files directly in the browser.
- **jsPDF & html2canvas**: For capturing screenshots and generating PDF reports.

## Getting Started

Since this is a client-side application, you don't need a complex server setup to get started.

1. Clone or download this repository.
2. Open `index.html` in your modern web browser (Chrome, Firefox, Edge, Safari) or use a local development server like Live Server.
3. Click on the **Browse Files** button or drag and drop a `.csv` dataset into the dropzone.
4. Use the toolbar to select your X and Y axes, choose a chart type, and start exploring your data!

## How to use the AI Assistant

1. Toggle the sidebar on the left using the menu button.
2. You can switch between the "Built-in AI" (if configured) or the "Own API" tab.
3. If using your own API, grab a [Google Gemini API Key](https://aistudio.google.com/app/apikey) and enter it in the settings.
4. Start chatting with the AI about your uploaded data.
