# CoolingOps Deployment

## Local Test

1. Run `docker compose up --build`
2. Open `http://localhost:80`
3. Test that the simulation works

## Deploy To Huawei Cloud

1. Install Docker Desktop on your laptop
2. Put your deployment credentials in `backend/.env`
3. Log in to SWR:

```bash
docker login -u AP-SOUTHEAST-1@$HUAWEI_AK -p $HUAWEI_SK $SWR_ADDRESS
```

4. Make sure `ECS_IP` is set in `backend/.env`
5. Run:

```bash
bash deploy.sh
```

## Frontend To OBS

1. Go to the frontend folder:

```bash
cd frontend
```

2. Build the frontend:

```bash
npm run build
```

3. Upload the contents of `dist/` to the OBS bucket `coolingops-frontend` using the Huawei Cloud console
4. Make sure `index.html` is at the root of the bucket

## Update After Code Changes

1. Make changes locally
2. Test with `docker compose up`
3. Run `bash deploy.sh` again
4. For frontend changes, run `npm run build` and re-upload the `dist/` contents to OBS

## Notes

- The ML models in `backend/ml/artifacts/` are included in the backend image
- The LBL CSV files in `backend/data/raw/official/` are mounted as data volumes instead of being relied on in the image at runtime
- Deployment credentials are loaded from `backend/.env`, not hardcoded in scripts
- The backend lives in `backend/` and the frontend lives in `frontend/`
- The root deployment file is `docker-compose.yml`
