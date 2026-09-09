import { describe, expect, it } from 'vitest';
import { parseGithubRepository } from '../app/lib/github-adapter';

describe('parseGithubRepository', () => {
  it('parses a bare owner/repo string', () => {
    expect(parseGithubRepository('Avantiikaa16/ReproZero_AWS_Demo')).toEqual({
      owner: 'Avantiikaa16',
      repo: 'ReproZero_AWS_Demo',
    });
  });

  it('parses a full https URL', () => {
    expect(parseGithubRepository('https://github.com/Avantiikaa16/ReproZero_AWS_Demo')).toEqual({
      owner: 'Avantiikaa16',
      repo: 'ReproZero_AWS_Demo',
    });
  });

  it('parses a .git-suffixed URL', () => {
    expect(parseGithubRepository('https://github.com/Avantiikaa16/ReproZero_AWS_Demo.git')).toEqual({
      owner: 'Avantiikaa16',
      repo: 'ReproZero_AWS_Demo',
    });
  });

  it('parses an ssh-style URL', () => {
    expect(parseGithubRepository('git@github.com:Avantiikaa16/ReproZero_AWS_Demo.git')).toEqual({
      owner: 'Avantiikaa16',
      repo: 'ReproZero_AWS_Demo',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(parseGithubRepository('Avantiikaa16/ReproZero_AWS_Demo/')).toEqual({
      owner: 'Avantiikaa16',
      repo: 'ReproZero_AWS_Demo',
    });
  });

  it('returns null for something that is not a repository reference', () => {
    expect(parseGithubRepository('not a repo at all')).toBeNull();
    expect(parseGithubRepository('')).toBeNull();
  });
});
