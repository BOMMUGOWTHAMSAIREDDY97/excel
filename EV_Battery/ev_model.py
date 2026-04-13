import scipy.io
import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_squared_error

# 1. DATA LOADING & EXTRACTION
def load_nasa_data(filenames):
    all_data = []
    
    for file in filenames:
        print(f"--- Processing {file} ---")
        try:
            mat = scipy.io.loadmat(file)
            # The structure is usually mat['filename'][0,0]['cycle']
            filename_key = file.split('.')[0]
            dataset = mat[filename_key][0, 0]
            cycles = dataset['cycle'][0]
            
            initial_capacity = None
            file_records = []

            for i in range(len(cycles)):
                cycle_type = cycles[i]['type'][0]
                
                # We only care about discharge cycles for SOH
                if cycle_type == 'discharge':
                    data = cycles[i]['data'][0, 0]
                    
                    # Extract raw arrays
                    temp = data['Temperature_measured'][0]
                    volt = data['Voltage_measured'][0]
                    curr = data['Current_measured'][0]
                    cap  = data['Capacity'][0][0]
                    
                    # Set initial capacity from the first discharge cycle found
                    if initial_capacity is None:
                        initial_capacity = cap
                    
                    # Feature Engineering
                    avg_temp = np.mean(temp)
                    avg_volt = np.mean(volt)
                    avg_curr = np.mean(curr)
                    soh = (cap / initial_capacity) * 100
                    
                    file_records.append({
                        'cycle_index': i,
                        'avg_temp': avg_temp,
                        'avg_volt': avg_volt,
                        'avg_curr': avg_curr,
                        'capacity': cap,
                        'SOH': soh
                    })
            
            print(f"Successfully extracted {len(file_records)} discharge cycles.")
            all_data.extend(file_records)
            
        except Exception as e:
            print(f"Error processing {file}: {e}")
            
    if not all_data:
        raise ValueError("No data extracted. Check file paths and internal .mat structure.")
        
    return pd.DataFrame(all_data)

# 2. MAIN EXECUTION FLOW
files = ['B0005.mat', 'B0006.mat', 'B0007.mat', 'B0018.mat']

try:
    df = load_nasa_data(files)

    # 3. DATA PROCESSING
    df = df.dropna()
    print(f"\nTotal Dataset Shape: {df.shape}")

    # 4. MODEL TRAINING
    # Features: Temp, Voltage, Current
    X = df[['avg_temp', 'avg_volt', 'avg_curr']]
    y = df['SOH']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Evaluation
    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))

    print(f"\nModel Performance:")
    print(f"R² Score: {r2:.4f}")
    print(f"RMSE: {rmse:.4f}% SOH")

    # 5. MODEL SAVING
    joblib.dump(model, 'battery_model.pkl')
    print("\nModel saved as 'battery_model.pkl'")

    # 6. TESTING / SAMPLE PREDICTION
    # Input format: [avg_temp, avg_volt, avg_curr]
    sample_input = np.array([[35.0, 3.9, 1.2]])
    prediction = model.predict(sample_input)
    print(f"\nSample Prediction for input {sample_input[0]}:")
    print(f"Predicted SOH: {prediction[0]:.2f}%")

    # 8. VISUALIZATION (BONUS)
    plt.figure(figsize=(12, 5))

    # SOH vs Cycle
    plt.subplot(1, 2, 1)
    plt.scatter(df['cycle_index'], df['SOH'], alpha=0.5, color='blue', s=10)
    plt.title('SOH Degradation over Cycles')
    plt.xlabel('Cycle Index')
    plt.ylabel('SOH (%)')

    # Feature Importance
    plt.subplot(1, 2, 2)
    importances = model.feature_importances_
    features = X.columns
    sns.barplot(x=importances, y=features, palette='viridis')
    plt.title('Feature Importance for SOH Prediction')

    plt.tight_layout()
    plt.show()

except FileNotFoundError:
    print("Error: .mat files not found in the current directory.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")