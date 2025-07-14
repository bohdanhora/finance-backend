import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as path from 'path';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import {
    AllTransactionsInfo,
    AllTransactionsInfoDocument,
} from 'src/transactions/schemas/all-info.schema';

@Injectable()
export class PdfService {
    constructor(
        @InjectModel(AllTransactionsInfo.name)
        private readonly transactionsModel: Model<AllTransactionsInfoDocument>,
    ) {}

    private getPrinter() {
        const fonts = {
            Roboto: {
                normal: path.resolve('assets/fonts/Roboto-Regular.ttf'),
                bold: path.resolve('assets/fonts/Roboto-Bold.ttf'),
                italics: path.resolve('assets/fonts/Roboto-Italic.ttf'),
                bolditalics: path.resolve('assets/fonts/Roboto-Medium.ttf'),
            },
        };

        return new PdfPrinter(fonts);
    }

    async generateUserPdf(userId: string): Promise<Buffer> {
        const data = await this.transactionsModel.findOne({ userId });

        if (!data) throw new Error('User not found');

        const { totalIncome, totalSpend, transactions } = data;

        const tableBody = [
            ['Amount', 'Date', 'Category', 'Description'],
            ...transactions.map((tx) => [
                (tx.transactionType === 'expence'
                    ? -tx.value
                    : tx.value
                ).toString(),
                new Date(tx.date).toLocaleDateString(),
                tx.categorie,
                tx.description,
            ]),
        ];

        const docDefinition: TDocumentDefinitions = {
            content: [
                { text: 'Transactions report', style: 'header' },
                { text: `User ID: ${userId}`, margin: [0, 0, 0, 10] },
                { text: `Total Income: ${totalIncome}`, style: 'summary' },
                {
                    text: `Total Spend: ${totalSpend}`,
                    style: 'summary',
                    margin: [0, 0, 0, 20],
                },

                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', 'auto', '*', '*'],
                        body: tableBody,
                    },
                },
            ],
            styles: {
                header: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
                summary: { fontSize: 14, bold: true },
            },
            defaultStyle: {
                font: 'Roboto',
            },
        };

        const printer = this.getPrinter();
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        const chunks: Buffer[] = [];
        return new Promise((resolve) => {
            pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.end();
        });
    }
}
