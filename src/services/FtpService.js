import { getConfig } from './ConfigService';

const { Client } = window.require('basic-ftp');
const path = window.require('path');
const { exec } = window.require('child_process');

function getFormattedDateStrings(dateObj) {
    const yy = dateObj.getFullYear().toString().slice(-2);
    const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const dd = dateObj.getDate().toString().padStart(2, '0');
    return {
        date: `${yy}${mm}${dd}`,
        date_month: `${yy}${mm}`
    };
}

function runCurlCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Command failed: ${stderr || error.message}`));
            } else {
                resolve(stdout);
            }
        });
    });
}

export async function downloadFtpFiles() {
    const config = getConfig();
    const ftp = config.ftp;
    if (!ftp) {
        throw new Error('No FTP configured');
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const { date, date_month } = getFormattedDateStrings(yesterday);

    const filesToDownload = [
        `DTBR_GAB_NATURA_${date}.dbf`,
        `LBER_NATURA_${date}.dbf`,
        `BDP_Q${date_month}.dbf`,
        'NEW_CUST_TSJ.xlsx'
    ];
    console.log("Files to download:", filesToDownload);

    const remoteDir = ftp.remote_directory ? `${ftp.remote_directory}/` : "";
    const results = [];

    for (const filename of filesToDownload) {
        const localPath = path.join(ftp.local_directory, filename);
        const remoteUrl = `ftp://${ftp.host}:${ftp.port}/${remoteDir}${filename}`;

        console.log(`Downloading ${filename} to ${localPath}...`);

        const command = `curl -k --ftp-ssl -u "${ftp.username}:${ftp.password}" -o "${localPath}" --create-dirs "${remoteUrl}"`;

        try {
            await runCurlCommand(command);
            results.push({ file: filename, status: 'success', path: localPath });
        } catch (downloadError) {
            console.error(`Could not download ${filename}. Reason: ${downloadError.message}`);
            results.push({ file: filename, status: 'error', error: downloadError.message });
        }
    }
    return results;
}
