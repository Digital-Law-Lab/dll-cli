import {
  QuestionCollection,
  Question as InquirerQuestion,
  Answers,
} from 'inquirer';
import { ListrRenderer, ListrTaskResult, ListrTaskWrapper } from 'listr2';

export interface APIKeyObject {
  api_key: string;
  api_root: string;
}

export type anyDict = { [key: string]: any };

export type TaskFunc<Ctx> = (
  ctx: Ctx,
  task: ListrTaskWrapper<Ctx, typeof ListrRenderer>
) => ListrTaskResult<Ctx>;

// withRequired not working properly
type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type inquirerLooperObject = {
  shouldLoopQuestion: QuestionCollection<
    WithRequired<InquirerQuestion, 'name' | 'message'>
  >;
  loopCondition: (
    shouldLoopQuestionAnswersHash: Record<string, any>
  ) => boolean;
  questions: Answers[];
};

export type APIKeyQuestion = {
  apiKey: string;
  apiRoot: string;
  apiKeyName: string;
};
