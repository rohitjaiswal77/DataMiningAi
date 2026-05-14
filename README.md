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
  - <img width="732" height="601" alt="Screenshot 2026-03-29 142617" src="https://github.com/user-attachments/assets/470f19db-6435-49e7-86f0-d1d72c0efcb4" />


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
<img width="1919" height="913" alt="Screenshot 2026-03-29 142606" src="https://github.com/user-attachments/assets/6d20b5c8-8f86-4ba3-a19e-3581cc9805f4" />
 


