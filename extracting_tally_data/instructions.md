This python script basically extracts the data from your tally and insert the data into chroma db 

Setup project.


Step 1: Install dependencies

pip install -r requirements.txt


Step 2:

Steps to run tally : 
turn on tally prime go to your company 
f1(help) 
settings connectivity clientserver- server port-9000 odbc- yes restart tally, check localhost://9000-> "tally is running"

Additional Setup: in config.json->

{
    "tally": 
    {
        "url": "http://localhost:9000",
        "company_name": "Demo Company"
    },
    "output": 
    {
        "directory": "output"
    }
}

change the company_name to the company you want to extract your data from.
now the tally is ready to be hit with the api-> 
cd tally_to_vector.py
python tally_to_vector.py



itll generate the data in chroma_db folder.